# Seller provider runtime handoff

Status: the Convex action path and an Agentverse-compatible Fetch seller agent are implemented on `feature/seller-side`. The repository still does not contain a real Agentverse URL or credential, so no live Fetch.ai prize claim is made until the external deployment is created and recorded.

The agent source is in `agents/fetch-seller/`. It can be copied into an
Agentverse Hosted Agent or run as a local uAgent. Hosted process globals are
not treated as durable state; the agent uses Fetch Agent Storage for the
pending/completed job record.

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
FETCH_SELLER_POLL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/poll
FETCH_SELLER_CANCEL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/cancel
FETCH_SELLER_ALLOWED_HOSTS=<verified-agent-host>
FETCH_SELLER_REQUEST_TIMEOUT_MS=8000
FETCH_SELLER_CONFIG_REVISION=fetch-seller-agentverse-v1
FETCH_SELLER_AGENT_TOKEN=<same long random secret configured as Agentverse FETCH_SELLER_SHARED_TOKEN>
```

Recommended for ambiguous-start reconciliation:

```text
FETCH_SELLER_RECONCILE_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/reconcile
```

The host must be an exact HTTPS hostname allowlisted for this deployment. Do not use a wildcard, URL path, IP literal or arbitrary buyer-provided URL. The Fetch adapter uses POST for poll, reconcile and cancel and includes the application `jobId` in the typed body. It sends the server-side token as `providerAuthToken` in the POST body because the uAgents REST handler consumes a request model; the token is also sent as a bearer header and is never logged or persisted.

The agent returns JSON with a bounded `providerRunId` and one of `pending`, `completed`, `failed` or `cancelled`; completed responses include the strict `SellerDecision` contract from `frontend/convex/lib/seller.schema.json`. A job starts pending, remains pending through the first poll, and becomes terminal on the next poll. Repeated starts with the same `jobId` and input digest replay the stored response; a different digest is rejected.

## Agentverse setup

1. Authenticate AVCTL with `avctl auth login` and check `avctl auth status`. The checked-in `agents/fetch-seller/.avctl/config.toml` links this repository to the existing Agentverse agent; do not create a second agent or use `hosting sync` as the source of truth.
2. From `agents/fetch-seller/`, run `avctl hosting deploy -f agent.py,seller_logic.py,README.md,pyproject.toml`. The deployment uses the pinned Agentverse-supported `uagents==0.25.5` dependency.
3. Add `FETCH_SELLER_SHARED_TOKEN` as an Agent Secret with `avctl hosting add secrets FETCH_SELLER_SHARED_TOKEN`. Generate a new random value for the deployment; do not reuse a source-control or personal credential. Start/restart the agent and record its compiled/running status.
4. Confirm whether the dashboard exposes a public HTTPS base URL for the custom REST routes. The Agentverse hosting control-plane URL or agent address alone is not a valid `FETCH_SELLER_START_URL`.
5. If direct custom REST is exposed, verify all four routes and use that exact HTTPS host. If it is not exposed, deploy the same source on the team's public Mana endpoint with `FETCH_SELLER_AGENT_ENDPOINT` and optional `FETCH_SELLER_AGENT_MAILBOX=true`; use the Mana HTTPS host for Convex and keep the Agentverse address as discovery/provenance evidence.
6. Set the Convex variables above with `npx convex env set NAME VALUE` from `frontend/` in a protected shell only after the route host has been verified.
7. Run one live seller job, one replay, one pending-to-terminal poll sequence, one explicit reconciliation, one cancellation, and one malformed/timeout recovery. Add the non-secret evidence to `docs/SELLER_SPONSOR_PROOF.md`.

AVCTL device-login credentials are short-lived by design. The CLI exposes no
documented lifetime-extension or refresh-duration flag. Re-authenticate when
`avctl auth status` reports expiry; use an Agentverse-provided automation/API
token only if its account permissions and lifetime are explicitly confirmed,
and keep it outside the repository.

The current official Agentverse API documents hosted-agent identity/control
operations and signed message-envelope submission; it does not establish that
`/v2/hosting/<address>` is a direct proxy for arbitrary `on_rest_post` routes.
Treat direct REST reachability as an external verification step rather than an
assumption.

## Chat Protocol role

The Agent Chat Protocol can be enabled later for public Agentverse/ASI:One
discoverability or a seller-capability demonstration. It must not replace the
seller job contract: Chat Protocol is conversational/string-oriented, while
seller jobs require strict typed inputs, server-owned scope, idempotency,
pending/terminal state, and reconciliation. A Chat handler must not accept raw
buyer prompts, private budgets, competitor data, hidden floors/costs, or an
arbitrary job command. If Fetch mailbox transport is preferred for the core
workflow, implement a separate typed uAgents Protocol/Dialogue and keep Chat
as an optional public surface.

The pure logic test can be run without the uAgents package:

```text
python agents/fetch-seller/test_seller_logic.py
```

For local uAgent testing, use an isolated Python 3.10–3.13 environment and a
vetted exact uAgents release. Do not run an unbounded package upgrade. The
repository's seven-day release-age rule applies to any locally added package;
Agentverse's hosted allowlisted runtime is the intended submission path.

## Provider allocation

The planned sponsor architecture assigns Fetch.ai to the seller role: each seller job gets one isolated Fetch run against that merchant's own catalog and policy. CREAO is planned for a distinct buyer-owned role such as intake, comparison/council or bounded evidence explanation. The seller action supports the same provider-neutral port for future configuration, but do not run both providers for the same seller job or use CREAO as silent failover. If CREAO is intentionally selected for a seller/merchant-operations role, use the analogous `CREAO_SELLER_*` variables and record why the role is distinct and necessary.

## Buyer-side integration note

`origin/geoff/buyer` currently has its own buyer job dispatcher and selects CREAO for live mode. When the branches are integrated, keep one provider call per seller job and choose the provider from server configuration. For a Fetch seller job, the buyer workflow must pass the `brief` to `sellerInternal.prepareSellerJob` or call `sellerInternal.attachSellerBrief` before scheduling `sellerAgent.dispatch`. It must not send the buyer job's larger input object to the seller provider.

The seller action does not close a buyer run, publish a shortlist, reserve stock, approve a quote or execute payment. Those remain buyer-owned responsibilities. The buyer completion handler should consume the seller result/status and advance only the expected run/phase.

## Live sponsor evidence still required

Do not claim the Fetch.ai prize from this adapter alone. The ledger needs a real reachable agent, non-secret provider run ID, config revision, input/output digests, pending-to-terminal transition, one accepted proposal, and one timeout or malformed-output recovery. The provider identity, agent address and model must be verified against the event's current rules before submission.
