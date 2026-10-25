"""Gateway tests: python -m unittest test_gateway (needs the pinned uagents)."""
import io
import json
import os
import unittest
from unittest import mock

try:
    import gateway
except ImportError as error:  # pragma: no cover
    raise unittest.SkipTest(f"uagents is not installed: {error}")

from protocol import MailboxResponse, ProviderResponse


class FakeHandler(gateway.GatewayHandler):
    def __init__(self, path, body=None, headers=None, method="POST"):
        raw = b"" if body is None else json.dumps(body).encode()
        self.path = path
        self.headers = {"Content-Length": str(len(raw)), **(headers or {})}
        self.rfile = io.BytesIO(raw)
        self.wfile = io.BytesIO()
        self.status = None
        self.sent = {}

    def send_response(self, code, message=None):
        self.status = code

    def send_header(self, key, value):
        self.sent[key] = value

    def end_headers(self):
        pass

    def json(self):
        return json.loads(self.wfile.getvalue())


ENV = {
    "FETCH_SELLER_GATEWAY_TOKEN": "gw-token",
    "FETCH_SELLER_SHARED_TOKEN": "shared-token",
    "FETCH_SELLER_AGENT_ADDRESS": "agent1qtestaddress",
}
POLL = {"jobId": "job_1", "providerAuthToken": "gw-token"}


@mock.patch.dict(os.environ, ENV, clear=False)
class GatewayTests(unittest.TestCase):
    def call(self, path, body=None, headers=None, method="POST"):
        handler = FakeHandler(path, body, headers)
        (handler.do_GET if method == "GET" else handler.do_POST)()
        return handler

    def test_imports_under_pinned_uagents(self):
        self.assertTrue(hasattr(gateway, "Envelope"))

    def test_health_reveals_no_configuration_values(self):
        handler = self.call("/health", method="GET")
        self.assertEqual(handler.status, 200)
        self.assertEqual(handler.json(), {"ok": True, "configured": True})

    def test_rejects_missing_and_wrong_tokens(self):
        self.assertEqual(self.call("/seller/jobs/poll", {"jobId": "job_1"}).status, 401)
        self.assertEqual(self.call("/seller/jobs/poll", {**POLL, "providerAuthToken": "nope"}).status, 401)
        self.assertEqual(self.call("/seller/jobs/poll", {"jobId": "job_1"}, {"Authorization": "Bearer nope"}).status, 401)

    def test_unknown_route_is_not_forwarded(self):
        self.assertEqual(self.call("/anything", POLL).status, 404)

    def test_body_token_is_replaced_by_shared_secret_before_forwarding(self):
        seen = {}

        async def fake_query(destination, message, timeout, **kwargs):
            seen["destination"] = destination
            seen["token"] = message.providerAuthToken
            return MailboxResponse(status="pending", providerRunId="fetch-seller:job_1", outputJson="", model="m", errorCode="", errorRetryable="")

        with mock.patch.object(gateway, "query", fake_query):
            handler = self.call("/seller/jobs/poll", POLL)
        self.assertEqual(handler.status, 200)
        self.assertEqual(handler.json()["status"], "pending")
        self.assertEqual(seen, {"destination": "agent1qtestaddress", "token": "shared-token"})

    def test_bearer_header_is_accepted(self):
        async def fake_query(destination, message, timeout, **kwargs):
            return ProviderResponse(status="completed", providerRunId="fetch-seller:job_1", output={"kind": "abstain"})

        with mock.patch.object(gateway, "query", fake_query):
            handler = self.call("/seller/jobs/poll", {"jobId": "job_1"}, {"Authorization": "Bearer gw-token"})
        self.assertEqual(handler.json()["output"], {"kind": "abstain"})

    def test_agent_timeout_is_retryable_failure(self):
        async def slow_query(destination, message, timeout, **kwargs):
            raise TimeoutError()

        with mock.patch.object(gateway, "query", slow_query):
            body = self.call("/seller/jobs/poll", POLL).json()
        self.assertEqual((body["status"], body["errorCode"], body["errorRetryable"]), ("failed", "PROVIDER_TIMEOUT", True))


if __name__ == "__main__":
    unittest.main()
