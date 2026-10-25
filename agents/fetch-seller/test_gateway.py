"""Gateway tests: python -m unittest test_gateway (needs the pinned uagents)."""
import io
import json
import os
import unittest
from unittest import mock

try:
    import gateway
    from uagents.crypto import Identity
    from uagents_core.envelope import Envelope
except ImportError as error:  # pragma: no cover
    raise unittest.SkipTest(f"uagents is not installed: {error}")

AGENT = Identity.from_seed("converge-gateway-test-agent", 0)
ROGUE = Identity.from_seed("converge-gateway-test-rogue", 0)
ENV = {
    "FETCH_SELLER_GATEWAY_TOKEN": "gw-token",
    "FETCH_SELLER_SHARED_TOKEN": "shared-token",
    "FETCH_SELLER_AGENT_ADDRESS": AGENT.address,
    "FETCH_SELLER_GATEWAY_SEED": "converge-gateway-test-gateway",
}
POLL = {"jobId": "job_1", "providerAuthToken": "gw-token"}


class FakeHandler(gateway.GatewayHandler):
    def __init__(self, path, body=None, headers=None):
        raw = b"" if body is None else json.dumps(body).encode()
        self.path = path
        self.headers = {"Content-Length": str(len(raw)), **(headers or {})}
        self.rfile = io.BytesIO(raw)
        self.wfile = io.BytesIO()
        self.status = None

    def send_response(self, code, message=None):
        self.status = code

    def send_header(self, key, value):
        pass

    def end_headers(self):
        pass

    def json(self):
        return json.loads(self.wfile.getvalue())


def agent_reply(signer=AGENT, status="pending", output=None, seen=None):
    def post(endpoint, body, timeout):
        request = Envelope.model_validate_json(body)
        assert request.verify()
        payload = json.loads(request.decode_payload())
        if seen is not None:
            seen.update({"endpoint": endpoint, "token": payload["providerAuthToken"], "sender": request.sender})
        reply = Envelope(version=1, sender=signer.address, target=request.sender, session=request.session,
                         schema_digest="model:test", protocol_digest=None)
        reply.encode_payload(json.dumps({"status": status, "providerRunId": "fetch-seller:job_1",
                                         "outputJson": json.dumps(output) if output else "", "model": "m",
                                         "errorCode": "", "errorRetryable": ""}))
        reply.sign(signer)
        return reply.model_dump_json().encode()
    return post


@mock.patch.dict(os.environ, ENV, clear=False)
class GatewayTests(unittest.TestCase):
    def call(self, path, body=None, headers=None, get=False):
        handler = FakeHandler(path, body, headers)
        (handler.do_GET if get else handler.do_POST)()
        return handler

    def test_health_reveals_no_configuration_values(self):
        handler = self.call("/health", get=True)
        self.assertEqual((handler.status, handler.json()), (200, {"ok": True, "configured": True}))

    def test_rejects_missing_and_wrong_tokens(self):
        self.assertEqual(self.call("/seller/jobs/poll", {"jobId": "job_1"}).status, 401)
        self.assertEqual(self.call("/seller/jobs/poll", {**POLL, "providerAuthToken": "nope"}).status, 401)
        self.assertEqual(self.call("/seller/jobs/poll", {"jobId": "job_1"}, {"Authorization": "Bearer nope"}).status, 401)

    def test_unknown_route_is_not_forwarded(self):
        self.assertEqual(self.call("/anything", POLL).status, 404)

    def test_forwards_signed_envelope_with_shared_secret_from_agent_identity(self):
        seen = {}
        with mock.patch.object(gateway, "_post_envelope", agent_reply(seen=seen)):
            handler = self.call("/seller/jobs/poll", POLL)
        self.assertEqual((handler.status, handler.json()["status"]), (200, "pending"))
        self.assertEqual(seen["token"], "shared-token")
        self.assertEqual(seen["endpoint"], gateway.DEFAULT_AGENT_ENDPOINT)
        self.assertTrue(seen["sender"].startswith("agent1"))

    def test_bearer_header_and_output_decoding(self):
        with mock.patch.object(gateway, "_post_envelope", agent_reply(status="completed", output={"kind": "abstain"})):
            body = self.call("/seller/jobs/poll", {"jobId": "job_1"}, {"Authorization": "Bearer gw-token"}).json()
        self.assertEqual((body["status"], body["output"]), ("completed", {"kind": "abstain"}))

    def test_reply_signed_by_another_agent_is_rejected(self):
        with mock.patch.object(gateway, "_post_envelope", agent_reply(signer=ROGUE)):
            body = self.call("/seller/jobs/poll", POLL).json()
        self.assertEqual((body["status"], body["errorCode"]), ("failed", "PROVIDER_PROTOCOL"))

    def test_agent_timeout_is_retryable_failure(self):
        def slow(endpoint, body, timeout):
            raise TimeoutError()
        with mock.patch.object(gateway, "_post_envelope", slow):
            body = self.call("/seller/jobs/poll", POLL).json()
        self.assertEqual((body["status"], body["errorCode"], body["errorRetryable"]), ("failed", "PROVIDER_TIMEOUT", True))


    def test_start_message_forwards_authority_beside_input(self):
        start = {"jobId": "job_1", "runId": "run_1", "phaseId": "final", "role": "seller_final", "inputRef": "ref",
                 "inputDigest": "d", "input": {"a": 1}, "sellerAuthority": {"schemaVersion": 2}}
        with mock.patch.dict(os.environ, ENV, clear=False):
            message = gateway._message_for("/seller/jobs", start)
            self.assertEqual(json.loads(message.inputJson), {"a": 1})
            self.assertEqual(json.loads(message.authorityJson), {"schemaVersion": 2})
            start.pop("sellerAuthority")
            self.assertEqual(gateway._message_for("/seller/jobs", start).authorityJson, "")


if __name__ == "__main__":
    unittest.main()
