# Seller provider runtime handoff

Status: implementation checkpoint on `feature/seller-side`. The Convex action path is deployed to the linked development deployment, but no real Fetch.ai endpoint or credential is committed or claimed as live evidence.

## Runtime flow

The buyer-owned workflow supplies a server-built, sanitized `SellerBrief`. The seller side then:

1. prepares a `sellerJobs` record bound to request/version, run, phase, merchant, candidates, policy version and input digest;
2. stores the brief in `sellerJobInputs` after strict validation;
3. calls the internal `sellerAgent:dispatch` action for a Fetch job;
4. sends only the public seller projection: brief, candidate IDs, own catalog facts, available quantity, MSRP/reference price and public service terms;
5. accepts `pending`, polls the same provider run, or reconciles an ambiguous start by application `jobId`;
6. passes completed output to `validateAndStoreProposal`, which recomputes fit, stock, floor, delivered price and policy terms before creating an immutable offer.

The provider never receives the raw buyer conversation, requirement origins, private maximum, competitor data, operator floor, unit costs or minimum contribution. The provider's output is not authoritative. A timeout or no-response network failure with no provider run ID becomes `ambiguous`; the action does not blindly start a second provider run. A reconciliation endpoint can resolve that state by the same job ID.

## Fetch environment

Set these as Convex environment variables in the target deployment. Use `npx convex env set NAME VALUE` from `frontend/` in a protected shell; never add them to `.env`, `.env.local`, source control, logs or a demo recording.

Required:

```text
FETCH_SELLER_START_URL=https://<verified-agent-host>/seller/jobs
FETCH_SELLER_POLL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/{providerRunId}
FETCH_SELLER_CANCEL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/{providerRunId}/cancel
FETCH_SELLER_ALLOWED_HOSTS=<verified-agent-host>
FETCH_SELLER_REQUEST_TIMEOUT_MS=8000
FETCH_SELLER_CONFIG_REVISION=fetch-seller-v1
FETCH_SELLER_AGENT_TOKEN=<secret, if the deployed agent requires one>
```

Optional but strongly recommended for ambiguous-start reconciliation:

```text
FETCH_SELLER_RECONCILE_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/by-application-id/{jobId}
```

The host must be an exact HTTPS hostname allowlisted for this deployment. Do not use a wildcard, URL path, IP literal or arbitrary buyer-provided URL. The provider must return JSON with a bounded `providerRunId` and one of `pending`, `accepted`, `running`, `completed`, `succeeded`, `failed` or `cancelled`; completed responses must include `output`. The output must be the strict `SellerDecision` contract from `frontend/convex/lib/seller.schema.json`.

## Provider allocation

The planned sponsor architecture assigns Fetch.ai to the seller role: each seller job gets one isolated Fetch run against that merchant's own catalog and policy. CREAO is planned for a distinct buyer-owned role such as intake, comparison/council or bounded evidence explanation. The seller action supports the same provider-neutral port for future configuration, but do not run both providers for the same seller job or use CREAO as silent failover. If CREAO is intentionally selected for a seller/merchant-operations role, use the analogous `CREAO_SELLER_*` variables and record why the role is distinct and necessary.

## Buyer-side integration note

`origin/geoff/buyer` currently has its own buyer job dispatcher and selects CREAO for live mode. When the branches are integrated, keep one provider call per seller job and choose the provider from server configuration. For a Fetch seller job, the buyer workflow must pass the `brief` to `sellerInternal.prepareSellerJob` or call `sellerInternal.attachSellerBrief` before scheduling `sellerAgent.dispatch`. It must not send the buyer job's larger input object to the seller provider.

The seller action does not close a buyer run, publish a shortlist, reserve stock, approve a quote or execute payment. Those remain buyer-owned responsibilities. The buyer completion handler should consume the seller result/status and advance only the expected run/phase.

## Live sponsor evidence still required

Do not claim the Fetch.ai prize from this adapter alone. The ledger needs a real reachable agent, non-secret provider run ID, config revision, input/output digests, pending-to-terminal transition, one accepted proposal, and one timeout or malformed-output recovery. The provider identity, agent address and model must be verified against the event's current rules before submission.
