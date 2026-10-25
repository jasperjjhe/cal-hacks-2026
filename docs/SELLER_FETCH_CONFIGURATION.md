# Seller provider runtime handoff

Status: the Convex action path, canonical v2 seller-role bridge, and
Agentverse-compatible Fetch seller agent are implemented on
`feature/seller-side`. The buyer reference publishes the canonical v2 envelopes
at `origin/geoff/buyer` `df26d70` (the v2 source was introduced at `d863b16`);
this branch consumes that source and keeps
buyer deadlines, retries, phase closure and publication authoritative. The
repository still does not contain a real gateway URL or credential, so no live
Fetch.ai prize claim is made until external deployment is configured and
recorded.

The agent source is in `agents/fetch-seller/`. It can be copied into an
Agentverse Hosted Agent or run as a local uAgent. Hosted process globals are
not treated as durable state; the agent uses Fetch Agent Storage for the
pending/completed job record.

## Integration acceptance update — 2026-10-25

The buyer checkout now merges seller v2 code from `dev` (`59f7de4`). An integration
regression caught and fixed two blockers: the Python worker rejected explicit
`seller_initial` roles, and opening jobs were polled by both the buyer workflow
and seller scheduler. Buyer-managed dispatch now disables the seller's independent
poll/retry scheduling. The configured-port test uses the actual Python logic,
pending/completed HTTP responses, council/finals and a persisted simulated order.
The HTTP/Agentverse transport in that test is mocked; it is not hosted proof.
Redeploy the fixed Python worker to the existing Agentverse agent before enabling
Fetch. Deploy the matching Convex functions together. See
[the integrated audit](INTEGRATED_MVP_AUDIT.md) for remaining activation work.

## Runtime flow

The buyer-owned workflow supplies a server-built, sanitized `SellerBrief`. The seller side then:

1. prepares a `sellerJobs` record bound to request/version, run, phase, merchant, candidates, policy version and input digest;
2. stores the brief in `sellerJobInputs` after strict validation;
3. calls the internal `sellerAgent:dispatch` action for a Fetch job;
4. sends only the public seller projection: brief, candidate IDs, own catalog facts, available quantity, MSRP/reference price and public service terms. A v5.3 advocacy/reply/final job additionally receives the immutable allowlisted common competition snapshot and checked public outcome references for the current phase, never arbitrary rival records; a final job also carries its own merchant's derived lowest authorized unit prices (`sellerAuthority`), one number per line, the maximum of the operator floor, discount bound and unit cost plus minimum contribution; no separate cost, cap or contribution fields, though the value equals whichever term binds and so can reveal the merchant's own floor or cost basis to its own agent (spec §4);
5. accepts `pending`, polls the same provider run, or reconciles an ambiguous start by application `jobId`;
6. passes completed output to `validateAndStoreProposal`, which recomputes fit, stock, floor, delivered price and policy terms before creating an immutable offer.

The provider never receives the raw buyer conversation, requirement origins, private maximum, arbitrary competitor data, competitor costs/floors, private rationale or sealed final submissions. The approved v5.3 public snapshot is the only permitted competitor projection and must be built from an explicit field allowlist. The provider's output is not authoritative. A timeout or no-response network failure with no provider run ID becomes `ambiguous`; the action does not blindly start a second provider run. A reconciliation endpoint can resolve that state by the same job ID.

## v5.3 seller council roles

The worker, gateway contract, and Convex handoff now accept the canonical v2
seller advocacy, grouped reply and final-invitation roles in addition to the
legacy opening path. Convex persists the validated v2 result and keeps final
promotion on the buyer-owned sealed lifecycle. The seller branch also applies
the pure `validateFinalOfferRevision` checks before storing a proposed final
offer.

- seller advocacy: defend the merchant's frozen candidates and optionally emit
  one scoped peer challenge;
- seller reply: answer the one grouped batch of admitted challenges for the
  merchant, with `defend`, `correct` or `unknown` dispositions;
- seller final: submit one hold, abstention or parent-bound revision per invited
  candidate, keeping the frozen basket and policy authority intact.
  The start envelope for this role carries `sellerAuthority`
  (`SellerFinalAuthority`): the merchant's own lowest authorized unit price per
  frozen line, derived in Convex at dispatch and sent beside the canonical
  input. Without it the worker holds. The gateway forwards it as
  `authorityJson`; the agent binds it into the replay record.

Changing `SellerMessage`/`StartRequest` changes the uAgents protocol digest, so
redeploy the hosted agent and restart the Mana gateway together from the same
commit.

The worker does not produce moderator briefs or adjudication outcomes. It does
not browse for new seller facts, invent source IDs, change the snapshot, rank
rivals or reopen bargaining. B owns phase scheduling, cross-offer validation,
checked outcomes, invitation records and sealed promotion. S owns seller scope,
policy/frozen-basket/economic validation and the final service-option authority.
Do not add a parallel Python schema: derive parsing and fixtures from the
buyer-owned canonical v2 contract source.

## Fetch environment

Set these as Convex environment variables in the target deployment. Use `npx convex env set NAME VALUE` from `frontend/` in a protected shell; never add them to `.env`, `.env.local`, source control, logs or a demo recording.

Required:

```text
FETCH_SELLER_START_URL=https://<verified-agent-host>/seller/jobs
FETCH_SELLER_POLL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/poll
FETCH_SELLER_CANCEL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/cancel
FETCH_SELLER_ALLOWED_HOSTS=<verified-agent-host>
FETCH_SELLER_REQUEST_TIMEOUT_MS=25000
FETCH_SELLER_CONFIG_REVISION=fetch-seller-agentverse-gateway-v1
FETCH_SELLER_AGENT_TOKEN=<gateway secret, matching FETCH_SELLER_GATEWAY_TOKEN>
```

Recommended for ambiguous-start reconciliation:

```text
FETCH_SELLER_RECONCILE_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/reconcile
```

The host must be an exact HTTPS hostname allowlisted for the Mana gateway. Do not use a wildcard, URL path, IP literal or arbitrary buyer-provided URL. The Fetch adapter uses POST for poll, reconcile and cancel and includes the application `jobId` in the typed body. It sends the gateway token as a bearer header and body; the gateway replaces that body token with the separately stored Agentverse shared secret for the typed uAgents query. Neither token is logged or persisted.

The agent returns JSON with a bounded `providerRunId` and one of `pending`, `completed`, `failed` or `cancelled`; completed responses include the strict `SellerDecision` contract from `frontend/convex/lib/seller.schema.json`. A job completes on the start call: the seller decision is deterministic, and the spec bounds seller council and final jobs at 30 seconds while the buyer polls every 15 seconds. `pending` remains a valid response (Convex polls it), and records left pending by older revisions finish on the next poll. Repeated starts with the same `jobId` and input digest replay the stored response; a different digest is rejected.

## Agentverse setup

1. Authenticate AVCTL with `avctl auth login` and check `avctl auth status`. The checked-in `agents/fetch-seller/.avctl/config.toml` links this repository to the existing Agentverse agent; do not create a second agent or use `hosting sync` as the source of truth.
2. From `agents/fetch-seller/`, run `avctl hosting deploy -f agent.py,protocol.py,seller_logic.py,seller_schema_data.py,seller.schema.json`. The deployment uses the typed `SellerMessage` query contract, canonical v2 schema copy and the pinned Agentverse-supported `uagents==0.25.5` repository manifest.
3. Add `FETCH_SELLER_SHARED_TOKEN` as an Agent Secret with `avctl hosting add secrets FETCH_SELLER_SHARED_TOKEN`. Generate a new random value for the deployment; do not reuse a source-control or personal credential. The current linked agent is compiled and running.
4. The current hosted wrapper does not expose `on_rest_post`; do not use the Agentverse address or control-plane URL as `FETCH_SELLER_START_URL`. The hosted seller is reached through the typed uAgents query contract.
5. Run `gateway.py` on the public Mana edge with `FETCH_SELLER_AGENT_ADDRESS`, `FETCH_SELLER_GATEWAY_TOKEN`, `FETCH_SELLER_SHARED_TOKEN` and `FETCH_SELLER_GATEWAY_SEED` (see the agent README transport notes). Terminate TLS at the Mana/public edge and expose only the four fixed `/seller/jobs*` POST routes. The gateway forwards to the fixed Agentverse address and never accepts a client-supplied destination or provider secret.
6. Set the Convex variables above with `npx convex env set NAME VALUE` from `frontend/` in a protected shell, using the verified Mana gateway host only after its HTTPS routes and gateway authentication have been tested.
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

The planned sponsor architecture assigns Fetch.ai to the seller role: each seller job gets one isolated Fetch run against that merchant's own catalog and policy, including v5.3 advocacy, grouped-reply and final roles. CREAO is reserved for a distinct buyer-owned role such as intake, comparison/council or bounded evidence explanation. The seller action uses the same provider-neutral port, but never runs both providers for one seller job or uses CREAO as silent failover. If CREAO is intentionally selected for a seller/merchant-operations role, use the analogous `CREAO_SELLER_*` variables and record why the role is distinct and necessary.

## Buyer-side integration note

The fetched buyer reference still has fixture-backed seller calls, but the merged seller branch now routes Fetch-configured opening, advocacy, reply and final jobs through `sellerAgent.dispatch`. It passes the brief or canonical role input before dispatch, and the buyer consumes the seller status/result bridge without giving the seller the larger buyer job object. With no Fetch gateway configured, the same paths remain explicitly fixture-backed for CI and the short demo.

The seller action does not close a buyer run, publish a shortlist, reserve stock, approve a quote or execute payment. Those remain buyer-owned responsibilities. The buyer completion handler should consume the seller result/status and advance only the expected run/phase.

## Live sponsor evidence still required

Do not claim the Fetch.ai prize from this adapter alone. The ledger needs a real reachable agent, non-secret provider run ID, config revision, input/output digests, pending-to-terminal transition, one accepted proposal, one v5.3 seller-role result with snapshot/phase provenance, and one timeout or malformed-output recovery. The provider identity, agent address and model must be verified against the event's current rules before submission.
