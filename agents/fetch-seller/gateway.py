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

import asyncio
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional

from uagents.envelope import Envelope
from uagents.query import query

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
DEFAULT_TIMEOUT_SECONDS = 15.0
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


def _authorized(headers: Any) -> bool:
    expected = _gateway_token()
    supplied = _authorization_value(headers)
    return bool(expected) and secrets.compare_digest(supplied, expected)


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


async def _query_agent(message: SellerMessage) -> ProviderResponse:
    address = _agent_address()
    if not address:
        raise RuntimeError("FETCH_SELLER_AGENT_ADDRESS is not configured")
    timeout = float(os.getenv("FETCH_SELLER_QUERY_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    response = await query(destination=address, message=message, timeout=timeout)
    if isinstance(response, ProviderResponse):
        return response
    if isinstance(response, Envelope):
        decoded = response.decode_payload()
        response = MailboxResponse(**json.loads(decoded))
    if isinstance(response, MailboxResponse):
        output = None
        if response.outputJson:
            output = json.loads(response.outputJson)
        return ProviderResponse(
            status=response.status,
            providerRunId=response.providerRunId,
            output=output,
            model=response.model or None,
            errorCode=response.errorCode or None,
            errorRetryable=(
                None
                if not response.errorRetryable
                else response.errorRetryable.lower() == "true"
            ),
        )
    if isinstance(response, dict):
        return ProviderResponse(**response)
    raise TypeError("agent returned an unsupported response")


def _run_query(message: SellerMessage) -> ProviderResponse:
    try:
        return asyncio.run(_query_agent(message))
    except (asyncio.TimeoutError, TimeoutError):
        return _failed(message.jobId, "PROVIDER_TIMEOUT", retryable=True)
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
        if not _authorized(self.headers):
            self._write_json(401, {"error": "unauthorized"})
            return
        try:
            payload = self._read_json()
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
        self._write_json(404, {"error": "not_found"})


def main() -> None:
    if not _gateway_token() or not _shared_agent_token() or not _agent_address():
        raise SystemExit(
            "FETCH_SELLER_GATEWAY_TOKEN, FETCH_SELLER_SHARED_TOKEN, and "
            "FETCH_SELLER_AGENT_ADDRESS are required"
        )
    host = os.getenv("FETCH_SELLER_GATEWAY_HOST", "127.0.0.1")
    port = int(os.getenv("FETCH_SELLER_GATEWAY_PORT", os.getenv("PORT", "8787")))
    server = ThreadingHTTPServer((host, port), GatewayHandler)
    print(f"Converge Fetch gateway listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
