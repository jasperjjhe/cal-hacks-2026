"""Small HTTP-to-uAgents gateway for the hosted Fetch seller agent.

Agentverse's hosted runtime supports the standard uAgents query/message
surface, while the custom REST decorators are not available in its pinned
runtime. This dependency-light gateway keeps Convex's existing strict HTTPS
port and forwards only the four fixed operations as a typed uAgents query.

Terminate TLS at the Mana/public edge. The process itself binds to localhost
by default and never accepts a client-supplied destination agent or provider
secret.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

try:  # uagents >= 0.20 moved the envelope model into uagents-core.
    from uagents_core.envelope import Envelope
except ImportError:  # pragma: no cover - older uagents releases
    from uagents.envelope import Envelope
from uagents.crypto import Identity
from uagents_core.models import Model

from protocol import (
    CancelRequest,
    MailboxResponse,
    PollRequest,
    ProviderResponse,
    ReconcileRequest,
    SellerMessage,
    StartRequest,
)
from seller_logic import SellerInputError, bounded_id


MAX_BODY_BYTES = 128 * 1024
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_AGENT_ENDPOINT = "https://agentverse.ai/v1/hosting/submit"
ROUTES = {
    "/seller/jobs",
    "/seller/jobs/poll",
    "/seller/jobs/reconcile",
    "/seller/jobs/cancel",
}


def _provider_run_id(job_id: Any) -> str:
    try:
        return f"fetch-seller:{bounded_id(job_id, 'jobId')}"
    except SellerInputError:
        return "fetch-seller:invalid"


def _failed(job_id: Any, code: str, retryable: bool = False) -> ProviderResponse:
    return ProviderResponse(
        status="failed",
        providerRunId=_provider_run_id(job_id),
        model="fetch-seller-gateway-v1",
        errorCode=code,
        errorRetryable=retryable,
    )


def _model_dict(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    raise TypeError("unsupported model response")


def _gateway_token() -> str:
    return os.getenv("FETCH_SELLER_GATEWAY_TOKEN", "").strip()


def _shared_agent_token() -> str:
    return os.getenv("FETCH_SELLER_SHARED_TOKEN", "").strip()


def _agent_address() -> str:
    return os.getenv("FETCH_SELLER_AGENT_ADDRESS", "").strip()


def _authorization_value(headers: Any) -> str:
    value = headers.get("Authorization", "")
    if not isinstance(value, str) or not value.startswith("Bearer "):
        return ""
    return value.removeprefix("Bearer ").strip()


def _authorized(headers: Any, payload: Optional[Dict[str, Any]] = None) -> bool:
    """Accept the gateway token from the bearer header or, when an edge proxy
    consumes Authorization, from the typed body field Convex also sends."""
    expected = _gateway_token()
    if not expected:
        return False
    supplied = _authorization_value(headers)
    if not supplied and isinstance(payload, dict):
        body_token = payload.get("providerAuthToken")
        supplied = body_token if isinstance(body_token, str) else ""
    return bool(supplied) and secrets.compare_digest(supplied, expected)


def _agent_endpoint() -> str:
    """Fixed submit endpoint for the destination agent; never taken from a request."""
    return os.getenv("FETCH_SELLER_AGENT_ENDPOINT", "").strip() or DEFAULT_AGENT_ENDPOINT


def _gateway_identity(index: int = 0) -> Identity:
    """One of the gateway's own agent identities. Agentverse returns hosted sync
    replies to agent-prefixed senders; uagents.query's throwaway user identities
    get a 500 from the hosted submit endpoint. Index 0 is the original identity."""
    seed = os.getenv("FETCH_SELLER_GATEWAY_SEED", "").strip()
    if not seed:
        raise RuntimeError("FETCH_SELLER_GATEWAY_SEED is not configured")
    return Identity.from_seed(seed, index)


DEFAULT_IDENTITY_POOL = 16


def _identity_pool_size() -> int:
    try:
        size = int(os.getenv("FETCH_SELLER_GATEWAY_IDENTITIES", str(DEFAULT_IDENTITY_POOL)))
    except ValueError:
        size = DEFAULT_IDENTITY_POOL
    return max(1, min(size, 64))


class _IdentityPool:
    """Agentverse's hosted submit endpoint fails overlapping sync queries from one
    sender (500s and timeouts once two are in flight), while queries from distinct
    senders run in parallel. Each in-flight query therefore leases its own derived
    identity (same seed, distinct index) and returns it when the reply arrives."""

    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._busy: set = set()

    @contextmanager
    def lease(self, size: int, timeout: float) -> Iterator[int]:
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                index = next((i for i in range(size) if i not in self._busy), None)
                if index is not None:
                    self._busy.add(index)
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("no free gateway identity")
                self._cond.wait(remaining)
        try:
            yield index
        finally:
            with self._cond:
                self._busy.discard(index)
                self._cond.notify()


_IDENTITIES = _IdentityPool()


def _post_envelope(endpoint: str, body: bytes, timeout: float) -> bytes:
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-uagents-connection": "sync",
            # Agentverse's edge rejects urllib's default User-Agent (Cloudflare 1010).
            "User-Agent": "converge-fetch-gateway/1",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed endpoint
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("agent response too large")
    return raw


def _message_for(path: str, payload: Dict[str, Any]) -> SellerMessage:
    shared_token = _shared_agent_token()
    if not shared_token:
        raise RuntimeError("FETCH_SELLER_SHARED_TOKEN is not configured")

    if path == "/seller/jobs":
        request = StartRequest(**payload)
        return SellerMessage(
            operation="start",
            jobId=request.jobId,
            providerRunId="",
            runId=request.runId,
            phaseId=request.phaseId,
            role=request.role,
            inputRef=request.inputRef,
            inputDigest=request.inputDigest,
            inputJson=json.dumps(request.input, separators=(",", ":"), ensure_ascii=True),
            providerAuthToken=shared_token,
            authorityJson=""
            if request.sellerAuthority is None
            else json.dumps(request.sellerAuthority, separators=(",", ":"), ensure_ascii=True),
        )
    if path == "/seller/jobs/poll":
        request = PollRequest(**payload)
        return SellerMessage(
            operation="poll",
            jobId=request.jobId,
            providerRunId=request.providerRunId or "",
            runId="",
            phaseId="",
            role="",
            inputRef="",
            inputDigest="",
            inputJson="",
            providerAuthToken=shared_token,
        )
    if path == "/seller/jobs/reconcile":
        request = ReconcileRequest(**payload)
        return SellerMessage(
            operation="reconcile",
            jobId=request.jobId,
            providerRunId="",
            runId="",
            phaseId="",
            role="",
            inputRef="",
            inputDigest="",
            inputJson="",
            providerAuthToken=shared_token,
        )
    if path == "/seller/jobs/cancel":
        request = CancelRequest(**payload)
        return SellerMessage(
            operation="cancel",
            jobId=request.jobId,
            providerRunId=request.providerRunId or "",
            runId="",
            phaseId="",
            role="",
            inputRef="",
            inputDigest="",
            inputJson="",
            providerAuthToken=shared_token,
        )
    raise ValueError("unsupported route")


def _query_agent(message: SellerMessage) -> ProviderResponse:
    address = _agent_address()
    if not address:
        raise RuntimeError("FETCH_SELLER_AGENT_ADDRESS is not configured")
    timeout = float(os.getenv("FETCH_SELLER_QUERY_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    with _IDENTITIES.lease(_identity_pool_size(), timeout) as index:
        return _query_agent_as(_gateway_identity(index), address, message, timeout)


def _query_agent_as(identity: Identity, address: str, message: SellerMessage, timeout: float) -> ProviderResponse:
    payload = message.model_dump_json() if hasattr(message, "model_dump_json") else message.json()
    envelope = Envelope(
        version=1,
        sender=identity.address,
        target=address,
        session=uuid.uuid4(),
        schema_digest=Model.build_schema_digest(message),
        protocol_digest=None,
        expires=int(time.time()) + int(timeout) + 5,
    )
    envelope.encode_payload(payload)
    envelope.sign(identity)
    raw = _post_envelope(_agent_endpoint(), envelope.model_dump_json().encode("utf-8"), timeout)
    reply = Envelope.model_validate_json(raw)
    # Only accept a reply signed by the fixed seller agent for this session.
    if reply.sender != address or reply.session != envelope.session or not reply.verify():
        raise ValueError("unexpected reply envelope")
    response = MailboxResponse(**json.loads(reply.decode_payload()))
    output = json.loads(response.outputJson) if response.outputJson else None
    return ProviderResponse(
        status=response.status,
        providerRunId=response.providerRunId,
        output=output,
        model=response.model or None,
        errorCode=response.errorCode or None,
        errorRetryable=(None if not response.errorRetryable else response.errorRetryable.lower() == "true"),
    )


def _run_query(message: SellerMessage) -> ProviderResponse:
    try:
        return _query_agent(message)
    except (TimeoutError, urllib.error.URLError) as error:
        reason = getattr(error, "reason", error)
        if isinstance(error, TimeoutError) or isinstance(reason, TimeoutError):
            return _failed(message.jobId, "PROVIDER_TIMEOUT", retryable=True)
        return _failed(message.jobId, "PROVIDER_UNAVAILABLE", retryable=True)
    except Exception:
        return _failed(message.jobId, "PROVIDER_PROTOCOL")


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "ConvergeFetchGateway/1"

    def log_message(self, format: str, *args: Any) -> None:
        # Do not log authorization headers, request bodies, buyer data, or
        # provider responses. The edge/runtime should provide access metrics.
        return

    def _write_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        if len(body) > MAX_RESPONSE_BYTES:
            body = json.dumps({"error": "response_too_large"}).encode("utf-8")
            status = 502
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ValueError("content length required")
        try:
            length = int(raw_length)
        except ValueError as error:
            raise ValueError("invalid content length") from error
        if length < 1 or length > MAX_BODY_BYTES:
            raise ValueError("request body too large")
        raw = self.rfile.read(length)
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("request body must be an object")
        return value

    def do_POST(self) -> None:
        if self.path not in ROUTES:
            self._write_json(404, {"error": "not_found"})
            return
        try:
            payload = self._read_json()
        except Exception:
            self._write_json(400, {"error": "invalid_request"})
            return
        if not _authorized(self.headers, payload):
            self._write_json(401, {"error": "unauthorized"})
            return
        try:
            message = _message_for(self.path, payload)
        except Exception:
            self._write_json(400, {"error": "invalid_request"})
            return
        response = _run_query(message)
        try:
            self._write_json(200, _model_dict(response))
        except Exception:
            self._write_json(502, {"error": "provider_protocol"})

    def do_GET(self) -> None:
        # Unauthenticated liveness only: no agent address, tokens or job data.
        if self.path in ("/health", "/healthz"):
            self._write_json(200, {"ok": True, "configured": bool(_gateway_token() and _shared_agent_token() and _agent_address() and os.getenv("FETCH_SELLER_GATEWAY_SEED", "").strip())})
            return
        self._write_json(404, {"error": "not_found"})


def main() -> None:
    if not _gateway_token() or not _shared_agent_token() or not _agent_address() or not os.getenv("FETCH_SELLER_GATEWAY_SEED", "").strip():
        raise SystemExit(
            "FETCH_SELLER_GATEWAY_TOKEN, FETCH_SELLER_SHARED_TOKEN, FETCH_SELLER_AGENT_ADDRESS "
            "and FETCH_SELLER_GATEWAY_SEED are required"
        )
    host = os.getenv("FETCH_SELLER_GATEWAY_HOST", "127.0.0.1")
    port = int(os.getenv("FETCH_SELLER_GATEWAY_PORT", os.getenv("PORT", "8787")))
    server = ThreadingHTTPServer((host, port), GatewayHandler)
    print(f"Converge Fetch gateway listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
