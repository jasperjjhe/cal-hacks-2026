"""BuyerUnion's Fetch.ai seller agent.

This file can be pasted into an Agentverse Hosted Agent or run as a local
uAgent. The REST surface is deliberately small and uses typed POST envelopes
so the Convex adapter does not depend on undocumented path parameters.
"""

from __future__ import annotations

import os
import secrets
from typing import Any, Dict, Optional

from uagents import Agent, Context, Model

from seller_logic import SellerInputError, bounded_id, build_decision


AGENT_NAME = os.getenv("FETCH_SELLER_AGENT_NAME", "buyerunion-fetch-seller")
SHARED_TOKEN_ENV = "FETCH_SELLER_SHARED_TOKEN"
MODEL_NAME = "fetch-seller-deterministic-v1"


class StartRequest(Model):
    jobId: str
    runId: str
    phaseId: str
    role: str
    inputRef: str
    inputDigest: str
    input: Dict[str, Any]
    providerAuthToken: Optional[str] = None


class PollRequest(Model):
    jobId: str
    providerRunId: Optional[str] = None
    providerAuthToken: Optional[str] = None


class ReconcileRequest(Model):
    jobId: str
    providerAuthToken: Optional[str] = None


class CancelRequest(Model):
    jobId: str
    providerRunId: Optional[str] = None
    providerAuthToken: Optional[str] = None


class ProviderResponse(Model):
    status: str
    providerRunId: str
    output: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    errorCode: Optional[str] = None
    errorRetryable: Optional[bool] = None


def _provider_run_id(job_id: str) -> str:
    return f"fetch-seller:{job_id}"


def _authorized(token: Optional[str]) -> bool:
    expected = os.getenv(SHARED_TOKEN_ENV, "").strip()
    supplied = token or ""
    # Missing configuration fails closed. The token is never included in a
    # response, storage record, or log message.
    return bool(expected) and secrets.compare_digest(supplied, expected)


def _failed(provider_run_id: str, code: str, retryable: bool = False) -> ProviderResponse:
    return ProviderResponse(
        status="failed",
        providerRunId=provider_run_id,
        model=MODEL_NAME,
        errorCode=code,
        errorRetryable=retryable,
    )


def _response_from_record(record: Dict[str, Any]) -> ProviderResponse:
    response = record.get("response")
    if not isinstance(response, dict):
        return _failed(str(record.get("providerRunId", "fetch-seller:invalid")), "PROVIDER_STORAGE_CORRUPT")
    try:
        return ProviderResponse(**response)
    except Exception:
        return _failed(str(record.get("providerRunId", "fetch-seller:invalid")), "PROVIDER_STORAGE_CORRUPT")


def _load_record(ctx: Context, job_id: str) -> Optional[Dict[str, Any]]:
    record = ctx.storage.get(f"seller_job:{job_id}")
    return record if isinstance(record, dict) else None


def _store_record(ctx: Context, job_id: str, record: Dict[str, Any]) -> None:
    # The record contains only the bounded digest, state, and validated
    # decision. It deliberately does not contain the inbound auth token or
    # the complete request envelope.
    ctx.storage.set(f"seller_job:{job_id}", record)


def _validate_job_id(value: Any) -> str:
    return bounded_id(value, "jobId")


def _request_job_id(value: Any) -> tuple[str, str]:
    try:
        job_id = _validate_job_id(value)
        return job_id, _provider_run_id(job_id)
    except SellerInputError:
        return "invalid", "fetch-seller:invalid"


def _validate_start_envelope(request: StartRequest, job_id: str) -> None:
    if _validate_job_id(request.runId) != request.input.get("job", {}).get("runId"):
        raise SellerInputError("request and input run IDs do not match")
    if request.input.get("job", {}).get("jobId") != job_id:
        raise SellerInputError("request and input job IDs do not match")
    if request.input.get("job", {}).get("phaseId") != request.phaseId:
        raise SellerInputError("request and input phase IDs do not match")
    if request.input.get("job", {}).get("role") != request.role:
        raise SellerInputError("request and input roles do not match")
    if not isinstance(request.inputDigest, str) or not 1 <= len(request.inputDigest) <= 256:
        raise SellerInputError("inputDigest is invalid")
    if not isinstance(request.inputRef, str) or not 1 <= len(request.inputRef) <= 256:
        raise SellerInputError("inputRef is invalid")


def _stored_response(status: str, provider_run_id: str, output: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response: Dict[str, Any] = {
        "status": status,
        "providerRunId": provider_run_id,
        "model": MODEL_NAME,
    }
    if output is not None:
        response["output"] = output
    return response


def _poll_record(ctx: Context, job_id: str, supplied_run_id: Optional[str]) -> ProviderResponse:
    provider_run_id = _provider_run_id(job_id)
    if supplied_run_id is not None and supplied_run_id != provider_run_id:
        return _failed(provider_run_id, "WRONG_JOB_SCOPE")
    record = _load_record(ctx, job_id)
    if record is None:
        return _failed(provider_run_id, "PROVIDER_NOT_FOUND")
    stored = _response_from_record(record)
    if stored.status in ("completed", "cancelled", "failed"):
        return stored
    decision = record.get("decision")
    if not isinstance(decision, dict):
        return _failed(provider_run_id, "PROVIDER_STORAGE_CORRUPT")
    poll_count = record.get("pollCount", 0)
    if isinstance(poll_count, bool) or not isinstance(poll_count, int) or poll_count < 0 or poll_count > 10:
        return _failed(provider_run_id, "PROVIDER_STORAGE_CORRUPT")
    if poll_count < 1:
        record["pollCount"] = poll_count + 1
        record["response"] = _stored_response("pending", provider_run_id)
        _store_record(ctx, job_id, record)
        return ProviderResponse(status="pending", providerRunId=provider_run_id, model=MODEL_NAME)
    record["response"] = _stored_response("completed", provider_run_id, decision)
    _store_record(ctx, job_id, record)
    return ProviderResponse(status="completed", providerRunId=provider_run_id, output=decision, model=MODEL_NAME)


agent_kwargs: Dict[str, Any] = {"name": AGENT_NAME}
seed = os.getenv("FETCH_SELLER_AGENT_SEED", "").strip()
if seed:
    agent_kwargs["seed"] = seed
port = os.getenv("FETCH_SELLER_AGENT_PORT", "").strip()
if port:
    try:
        agent_kwargs["port"] = int(port)
    except ValueError as error:
        raise RuntimeError("FETCH_SELLER_AGENT_PORT must be an integer") from error
endpoint = os.getenv("FETCH_SELLER_AGENT_ENDPOINT", "").strip()
if endpoint:
    agent_kwargs["endpoint"] = [endpoint]

agent = Agent(**agent_kwargs)


@agent.on_rest_post("/seller/jobs", StartRequest, ProviderResponse)
async def start_seller_job(ctx: Context, request: StartRequest) -> ProviderResponse:
    job_id, provider_run_id = _request_job_id(request.jobId)
    if not _authorized(request.providerAuthToken):
        return _failed(provider_run_id, "PROVIDER_AUTH")
    try:
        _validate_start_envelope(request, job_id)
        existing = _load_record(ctx, job_id)
        if existing is not None:
            if existing.get("inputDigest") != request.inputDigest:
                return _failed(provider_run_id, "REPLAY_REJECTED")
            return _response_from_record(existing)
        decision = build_decision(request.input)
    except SellerInputError:
        return _failed(provider_run_id, "INVALID_INPUT")
    except Exception:
        # Do not expose parser internals or provider storage details to the
        # caller. Convex treats this as a non-retryable protocol failure.
        return _failed(provider_run_id, "PROVIDER_PROTOCOL")

    record = {
        "inputDigest": request.inputDigest,
        "providerRunId": provider_run_id,
        "pollCount": 0,
        "decision": decision,
        "response": _stored_response("pending", provider_run_id),
    }
    _store_record(ctx, job_id, record)
    return ProviderResponse(status="pending", providerRunId=provider_run_id, model=MODEL_NAME)


@agent.on_rest_post("/seller/jobs/poll", PollRequest, ProviderResponse)
async def poll_seller_job(ctx: Context, request: PollRequest) -> ProviderResponse:
    job_id, provider_run_id = _request_job_id(request.jobId)
    if not _authorized(request.providerAuthToken):
        return _failed(provider_run_id, "PROVIDER_AUTH")
    return _poll_record(ctx, job_id, request.providerRunId)


@agent.on_rest_post("/seller/jobs/reconcile", ReconcileRequest, ProviderResponse)
async def reconcile_seller_job(ctx: Context, request: ReconcileRequest) -> ProviderResponse:
    job_id, provider_run_id = _request_job_id(request.jobId)
    if not _authorized(request.providerAuthToken):
        return _failed(provider_run_id, "PROVIDER_AUTH")
    return _poll_record(ctx, job_id, provider_run_id)


@agent.on_rest_post("/seller/jobs/cancel", CancelRequest, ProviderResponse)
async def cancel_seller_job(ctx: Context, request: CancelRequest) -> ProviderResponse:
    job_id, provider_run_id = _request_job_id(request.jobId)
    if not _authorized(request.providerAuthToken):
        return _failed(provider_run_id, "PROVIDER_AUTH")
    if request.providerRunId is not None and request.providerRunId != provider_run_id:
        return _failed(provider_run_id, "WRONG_JOB_SCOPE")
    record = _load_record(ctx, job_id)
    if record is None:
        return _failed(provider_run_id, "PROVIDER_NOT_FOUND")
    if _response_from_record(record).status in ("completed", "failed", "cancelled"):
        return _response_from_record(record)
    record["response"] = _stored_response("cancelled", provider_run_id)
    _store_record(ctx, job_id, record)
    return ProviderResponse(status="cancelled", providerRunId=provider_run_id, model=MODEL_NAME)


if __name__ == "__main__":
    agent.run()

