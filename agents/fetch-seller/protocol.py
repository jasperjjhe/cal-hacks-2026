"""Canonical typed messages shared by the seller agent and its HTTP gateway.

No `from __future__ import annotations` here: Agentverse's hosted runtime
builds these models with pydantic v1, where postponed (string) annotations
stay unresolved ForwardRefs and every envelope fails to process.
"""

from typing import Any, Dict, Optional

from uagents import Model


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


class SellerMessage(Model):
    """Typed mailbox/query envelope for hosted Agentverse runtimes."""

    operation: str
    jobId: str
    providerRunId: str
    runId: str
    phaseId: str
    role: str
    inputRef: str
    inputDigest: str
    inputJson: str
    providerAuthToken: str


class MailboxResponse(Model):
    """Schema-safe query response; complex output crosses as bounded JSON."""

    status: str
    providerRunId: str
    outputJson: str
    model: str
    errorCode: str
    errorRetryable: str


class ProviderResponse(Model):
    status: str
    providerRunId: str
    output: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    errorCode: Optional[str] = None
    errorRetryable: Optional[bool] = None
