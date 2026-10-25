"""Agent job-state tests: python -m unittest test_agent (needs the pinned uagents)."""
import os
import unittest

os.environ.setdefault("FETCH_SELLER_AGENT_SEED", "converge-agent-unit-test-seed")
os.environ["FETCH_SELLER_SHARED_TOKEN"] = "shared-token"

try:
    import agent as A
except ImportError as error:  # pragma: no cover
    raise unittest.SkipTest(f"uagents is not installed: {error}")

import json

from protocol import CancelRequest, PollRequest, SellerMessage, StartRequest
from test_seller_logic import authority_for, council_input, final_input, sample_input, with_rival_total


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


def start(ctx, payload, role, job_id, digest="digest-1", token="shared-token", authority=None):
    job = payload.get("job", {})
    run_id = payload.get("runId") or job.get("runId")
    phase_id = job.get("phaseId") or payload.get("phase") or "final"
    return A._start_seller_job(ctx, StartRequest(jobId=job_id, runId=run_id, phaseId=phase_id, role=role,
                                                 inputRef="ref", inputDigest=digest, input=payload,
                                                 providerAuthToken=token, sellerAuthority=authority))


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


    def test_final_authority_prices_the_decision_and_is_bound_into_replay(self):
        ctx = FakeCtx()
        payload = with_rival_total(final_input(), 99_000)
        authority = authority_for(payload, 90_000)
        first = start(ctx, payload, "seller_final", "final_job_1", authority=authority)
        self.assertEqual(first.status, "completed", first.errorCode)
        self.assertEqual(first.output["decision"]["kind"], "propose")
        self.assertEqual(start(ctx, payload, "seller_final", "final_job_1", authority=authority).output, first.output)
        other = dict(authority, lines=[dict(authority["lines"][0], lowestAuthorizedUnitCents=95_000)])
        self.assertEqual(start(ctx, payload, "seller_final", "final_job_1", authority=other).errorCode, "REPLAY_REJECTED")

    def test_final_reusing_the_opening_job_id_is_a_new_job_not_a_replay(self):
        # Convex reuses the opening seller job ID for the same candidate's sealed final.
        ctx = FakeCtx()
        opening_input = sample_input()
        opening_input["job"]["jobId"] = "final_job_1"
        opening = start(ctx, opening_input, "seller_initial", "final_job_1", digest="opening-digest")
        self.assertEqual(opening.status, "completed", opening.errorCode)
        payload = with_rival_total(final_input(), 99_000)
        final = start(ctx, payload, "seller_final", "final_job_1", digest="final-digest", authority=authority_for(payload, 90_000))
        self.assertEqual(final.status, "completed", final.errorCode)
        self.assertEqual(final.output["decision"]["kind"], "propose")
        poll = A._poll_seller_job(ctx, PollRequest(jobId="final_job_1", providerAuthToken="shared-token"))
        self.assertEqual(poll.output, final.output)
        self.assertEqual(start(ctx, payload, "seller_final", "final_job_1", digest="other-digest").errorCode, "REPLAY_REJECTED")

    def test_authority_is_refused_outside_final_invitations_and_when_inconsistent(self):
        payload = final_input()
        authority = authority_for(payload, 90_000)
        self.assertEqual(start(FakeCtx(), council_input(), "seller_advocacy", "council_job_1", authority=authority).errorCode, "INVALID_INPUT")
        broken = dict(authority, totalCents=authority["totalCents"] + 1)
        self.assertEqual(start(FakeCtx(), payload, "seller_final", "final_job_1", authority=broken).errorCode, "INVALID_INPUT")

    def test_mailbox_envelope_carries_the_authority(self):
        payload = with_rival_total(final_input(), 99_000)
        message = SellerMessage(operation="start", jobId="final_job_1", providerRunId="", runId=payload["runId"],
                                phaseId="final", role="seller_final", inputRef="ref", inputDigest="digest-1",
                                inputJson=json.dumps(payload), providerAuthToken="shared-token",
                                authorityJson=json.dumps(authority_for(payload, 90_000)))
        response = A._handle_mailbox_message(FakeCtx(), message)
        self.assertEqual(response.status, "completed", response.errorCode)
        self.assertEqual(response.output["decision"]["kind"], "propose")
        without = SellerMessage(**{**message.dict(), "authorityJson": ""})
        self.assertEqual(A._handle_mailbox_message(FakeCtx(), without).output["decision"]["kind"], "hold")


if __name__ == "__main__":
    unittest.main()
