> Current buyer council migration: [implementation and seller boundary](BUYER_COUNCIL_MIGRATION.md).
> Buyer v2 contracts/coordinator now run with seller fixtures; the older
> implementation-gap descriptions below are historical. Seller/live acceptance
> and service authority remain pending. Use the two new CREAO agent definitions.

# Dev B buyer backend handoff

## v5.3 council revision — specified, not implemented

The active [PRD/technical spec](../BUYERUNION_IMPLEMENTATION.md), sections 5.7
and 9, replaces the old council with a common frozen public snapshot, checked
competitive briefs, merchant defense/peer challenge, one grouped reply per target,
checked outcomes and a sealed final invitation for every eligible candidate.
Above-budget hard-valid offers participate without exposing affordability.
Products/configurations/conditions/quantities stay fixed; only price reductions
and explicitly policy-authorized service improvements are permitted. Unsupported
accusations cannot penalize rivals. Buyers see short checked exchanges as ready;
raw allegations and sealed terms stay hidden. Keep 210 seconds and 28/40 call/tool
caps; the old 45-second complete-comparison target is withdrawn pending measurement.

B must replace the old `ChallengePlan` orchestration, build the explicit public
snapshot and concrete comparative feedback, persist advocacy/reply/adjudication
subphases and remove the competitive final usefulness gate. S must implement
scoped peer roles and parent-bound fixed-basket/service-authority validation.
Schema/worker exports, runtime roles, fixtures, provider prompts, buyer views and
acceptance tests change together. See [seller council handoff](SELLER_COUNCIL_HANDOFF.md)
for exact ownership and seller-branch documentation sync. No such runtime changes
were made by this revision; implementation descriptions below refer to the prior
workflow. New council participation/feedback must not depend on private ceiling.

The current checkout's CREAO/Apify transport adapters were subsequently filled
in; [BUYER_INTEGRATIONS.md](BUYER_INTEGRATIONS.md) supersedes the older adapter
fill-in checklist below. Its existing moderator role is still the earlier
protocol, and live provider acceptance remains separate from adapter unit tests.


The user froze the contracts and authorized a complete backend on `geoff/buyer`, followed
by user-filled external integrations. Convex account/cloud deployment being
postponed did not block implementation. The default interface now uses a real
local Convex deployment; `/mock` is explicitly the old offline preview.

## Review fixes and Dev S integration

See [BUYER_REVIEW_RESOLUTION.md](BUYER_REVIEW_RESOLUTION.md) for the final review
findings, regression coverage, exact-token authentication and migration steps.
The original Dev S commit was copied into this branch; the future branch merge
still needs explicit conflict resolution rather than replacing either schema.

## Authoritative implementation

- `frontend/src/contracts/index.ts`: strict runtime wire schemas, inferred types
  and exported JSON Schema. No private request is spread into seller inputs.
- `frontend/convex/buyer.ts`: authenticated public buyer actions and queries.
- `buyerMutations.ts`, `buyer/checkout.ts`: transactional writes and exact quote
  approval. Public commands wrap one internal transaction and catch errors
  outside it, so a failed swap cannot commit an earlier release.
- `buyerWorkflow.ts` (current baseline): durable matching → moderator-led council
  → usefulness-gated sealed final-price round → research → checked results. Global/phase caps, stale-job rejection,
  cancellation and partial outcomes are server-owned.
- `buyerJobs.ts`, `buyerRoles.ts`: scoped intake, moderator, seller and evidence
  summary jobs; provider reference/digest validation; one bounded retry/repair.
- `buyerEvidence.ts`: automatic RAG review discovery, server domain policy, exact/family applicability,
  provenance, 24-hour cache, up to 8 URLs/40 excerpts per identity, 5 identities
  including one bounded refill. Authoritative exact facts call S's `assessLine`;
  contradictions block selection. Owner/family commentary cannot certify fit or
  unit health. Source failure produces unavailable evidence, never fake reviews.
- `buyer/inventory.ts`, `buyerExecution.ts`: S inventory helpers in the same
  transaction as quotes/approval/orders; reserve/lock/sell/release, three-minute
  quote expiry, unknown reconciliation and unique execution/order handling.
- `buyerAdmin.ts`, `auth.ts`: anonymous buyers; internally provisioned Password
  operators; no public signup or client-selected role/payment scenario.
- `buyerMaintenance.ts`, `crons.ts`: seven-day cleanup after reconciliation.
  Unresolved attempts/allocations stay locked; sold stock ledger remains counted.
- `frontend/src/BackendApp.tsx`: backend subscriptions drive the default journey.
  Local state is limited to editable form inputs, navigation, modal and comparison
  selections. Browser state never authorizes stock or payment.

## Public API transport

Convex actions accept `{input: payload}`; `payload` is the frozen command object.
They return `{ok:true,value}` or `{ok:false,error:ApiError}`. Queries take their
named fields directly. `getBuyerRun({requestId})` resolves the current run and
returns null before one exists; `getRunEvents({requestId,cursor:null|string})`
returns `{events,nextCursor}` and rejects a cursor from a superseded run. This envelope keeps transaction errors structured without
catching them inside a write transaction.

Actions: `saveDraft`, `interpretDraft`, `confirmRequest`, `startRun`, `cancelRun`,
`reviseRequest`, `selectAndReserve`, `approveAndExecute`, `setSort`, `toggleSaved`,
`removeSaved`. Queries: `getDraft`, `getConfirmedRequest`, `getBuyerRun`,
`getRunEvents`, `getEvidence`, `getPurchase`, `getProfiles`, `listRequests`,
`listSaved`, `listOrders`. Query denials throw a safe domain error and the UI has
an error boundary for unavailable requests.

Expected draft/request versions guard edits. `startRun`, selection and approval
require a caller-generated command key. Same key + changed payload is rejected;
replaying selection does not extend expiry. A second approval key for the same
quote still returns the same execution. Internal completions are never public
callbacks; stale request/run/phase/provider references cannot promote offers.

## Dev S integration

Imported S source from `origin/feature/seller-side` commit `37d7ea5`, without
merging or changing that branch. Buyer mutations reuse `loadSnapshots`,
`getPolicy`, `toPolicy`, `assessLine`, `validateSellerProposal`,
`minimumUnitCents`, `reserveInTransaction` and
`transitionAllocationInTransaction`. The public buyer fit shape is an explicit
adapter of S's assessment, not a separate fit algorithm.

Integration changes to reconcile when the seller branch merges:

- Unified schema includes auth, buyer and seller tables; added quote lookup and
  buyer retention indexes. Convex `_generated` files are CLI-generated.
- Exported S snapshot/policy helpers. Expired unapproved holds no longer count.
- `deferPromotion` stages final offers without updating the candidate's effective
  offer or emitting accepted-price events until the round closes.
- Explicit `decline` transition releases execution-locked allocations only after
  a definite decline. Repeated transitions are guarded by B.
- Unknown soft preferences stay in the denominator; multi-line fit is weighted
  globally. Unit conversion reuses S's numeric unit registry.
- Related accessories require exact primary compatibility; combined quantities
  for one listing cannot exceed stock. Factual claims require scoped source IDs.
- Password memberships use the stable authenticated user ID portion of the
  subject, so refreshing a session does not lose merchant ownership.
- Quotes compare current product facts as well as listing/policy versions before
  execution-locking; locked execution continues using its approved snapshot.

S still owns future catalog/policy improvements and the seller dashboard. Existing
fixture identities are synthetic, including laptop aliases. Add a genuinely
identified product via S's catalog before claiming live exact-product evidence.
Included-charger status and per-unit refurbished health are explicit synthetic
listing diagnostics. Unknown unit health overrides a generic product fact and
fails a mandatory threshold. Existing local seeds can be upgraded without a stock
reset via `buyerAdmin:upgradeDemoDiagnostics`; new seeds include these facts.
A genuine catalog identity is still required for an externally evidenced demo.

## Final adapter fill-in work

Use `frontend/convex/integrations/buyerTools.ts`:

1. `invokeCreao`, `pollCreao`, `cancelCreao`: implement the verified project API.
   `ToolJob` contains immutable role-scoped inputs, job ID, deadline and expected
   provider reference. Keep role outputs strict. Use the job ID as the vendor
   idempotency key. Do not pass private buyer conversation/ceiling to seller roles.
   The seller branch also has provider port utilities under `convex/integrations`;
   coordinate transport reuse rather than guessing CREAO endpoints.
2. `startEvidence`, `pollEvidence`: implemented using pinned Apify RAG Web Browser.
   `BUYER_EVIDENCE_REGISTRY` now contains `actorId`, immutable `build`, numeric
   `buildNumber`, optional `domains`, and optional pinned `reddit` configuration; no
   manually curated `sources` array. Reddit runs as a separate comment-search job;
   source aggregation preserves successful evidence when the other provider fails.
   Searches come from genuine catalog product names. Approved-domain/model-matching
   scraped pages become unverified family-level Evidence, with run/build attribution.
   Existing cache/deadline/ownership checks remain. Fictional products skip research.
   See `docs/BUYER_INTEGRATIONS.md` for copy-ready configuration and limitations.
3. `executePayment`, `reconcilePayment`: simulation already works. Enable Visa
   sandbox only after supported execution/status lookup, test-merchant mapping
   and idempotency are demonstrated. External mode remains blocked until that
   final implementation explicitly changes the server gate. Never replace a
   timeout with a decline or start another attempt for an unknown purchase.

After implementing the agent adapter, select live mode internally with
`buyerAdmin:configureDemo` (`agents:"live"`) and `BUYER_AGENT_MODE=live` for intake.
Server-only `paymentScenario` supports `success`, `declined`,
`unknown_then_success`; it cannot be selected through buyer commands. Do not
claim live provider use simply because an adapter file or environment name exists.

## Verification and operating notes

See `frontend/README.md` for exact local startup and checks. Keep `convex dev`
running for the local DB; `--once` stops its local process after deployment. The
local browser has completed one persisted simulated order and reload recovery.
Automated backend tests exercise function handlers plus Workflow components;
external adapters remain intentionally unconfigured and unverified.

A deployed demo still needs the team's Convex hosting choice, authentication keys,
public frontend URL and external provider configuration. There is no public
production deployment or real payment claim. Guest recovery across browsers and
optional sponsor add-ons remain outside the core scope.


## Recovery and adapter requirements added by the final review

Approval and each execution claim schedule a durable 60-second watchdog. If an
action stops before settlement, the watchdog changes the same attempt to unknown
and schedules status reconciliation. It never invokes payment again. The payment
adapter must look up by execution ID even when no provider reference was received.
Unknown outcomes retain inventory; only definite decline or success releases or
sells locked stock. Retention checks unresolved attempts before any history cap.

A thrown CREAO start is ambiguous and becomes pending on the same job identity,
without creating a repair start. `pollCreao` must support reconciliation using
`ToolJob.id` when `providerRunId` is null. Return explicit `failed` only when the
provider definitively rejected or terminated the work. The bounded repair path
remains available for definite failures and invalid output.

`getEvidence` accepts optional `runId` for archived bookmarks, while enforcing
request/run ownership. New bookmarks retain both identifiers; older snapshots
without them explicitly report unavailable archived evidence. Excerpts are not
presented as independent source counts.
