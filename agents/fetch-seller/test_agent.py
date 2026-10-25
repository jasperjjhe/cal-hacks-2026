"""Agent job-state tests: python -m unittest test_agent (needs the pinned uagents)."""
import os
import unittest

os.environ.setdefault("FETCH_SELLER_AGENT_SEED", "converge-agent-unit-test-seed")
os.environ["FETCH_SELLER_SHARED_TOKEN"] = "shared-token"

try:
    import agent as A
except ImportError as error:  # pragma: no cover
    raise unittest.SkipTest(f"uagents is not installed: {error}")

from protocol import CancelRequest, PollRequest, StartRequest
from test_seller_logic import council_input, final_input, sample_input


class FakeStorage:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value

    def has(self, key):
        return key in self.values

    def remove(self, key):
        self.values.pop(key, None)


class FakeCtx:
    def __init__(self):
        self.storage = FakeStorage()


def start(ctx, payload, role, job_id, digest="digest-1", token="shared-token"):
    job = payload.get("job", {})
    run_id = payload.get("runId") or job.get("runId")
    phase_id = job.get("phaseId") or payload.get("phase") or "final"
    return A._start_seller_job(ctx, StartRequest(jobId=job_id, runId=run_id, phaseId=phase_id, role=role,
                                                 inputRef="ref", inputDigest=digest, input=payload,
                                                 providerAuthToken=token))


class AgentJobTests(unittest.TestCase):
    def test_every_role_completes_on_the_start_call(self):
        cases = [
            ("seller_initial", sample_input(), "job_fetch_test"),
            ("seller_advocacy", council_input(), "council_job_1"),
            ("seller_final", final_input(), "final_job_1"),
        ]
        for role, payload, job_id in cases:
            with self.subTest(role=role):
                response = start(FakeCtx(), payload, role, job_id)
                self.assertEqual(response.status, "completed", response.errorCode)
                self.assertIsNotNone(response.output)

    def test_replay_poll_and_cancel_return_the_stored_result(self):
        ctx = FakeCtx()
        first = start(ctx, sample_input(), "seller_initial", "job_fetch_test")
        replay = start(ctx, sample_input(), "seller_initial", "job_fetch_test")
        poll = A._poll_seller_job(ctx, PollRequest(jobId="job_fetch_test", providerAuthToken="shared-token"))
        cancel = A._cancel_seller_job(ctx, CancelRequest(jobId="job_fetch_test", providerAuthToken="shared-token"))
        self.assertEqual({first.status, replay.status, poll.status, cancel.status}, {"completed"})
        self.assertEqual(replay.output, first.output)

    def test_changed_digest_is_rejected_and_wrong_token_fails_closed(self):
        ctx = FakeCtx()
        start(ctx, sample_input(), "seller_initial", "job_fetch_test")
        self.assertEqual(start(ctx, sample_input(), "seller_initial", "job_fetch_test", digest="other").errorCode, "REPLAY_REJECTED")
        self.assertEqual(start(FakeCtx(), sample_input(), "seller_initial", "job_fetch_test", token="nope").errorCode, "PROVIDER_AUTH")

    def test_legacy_pending_record_still_completes(self):
        ctx = FakeCtx()
        start(ctx, sample_input(), "seller_initial", "job_fetch_test")
        key = next(iter(ctx.storage.values))
        record = ctx.storage.values[key]
        record["response"] = A._stored_response("pending", record["providerRunId"])
        poll = A._poll_seller_job(ctx, PollRequest(jobId="job_fetch_test", providerAuthToken="shared-token"))
        self.assertIn(poll.status, ("pending", "completed"))
        if poll.status == "pending":
            poll = A._poll_seller_job(ctx, PollRequest(jobId="job_fetch_test", providerAuthToken="shared-token"))
        self.assertEqual(poll.status, "completed")


if __name__ == "__main__":
    unittest.main()
