# Buyer council v2 implementation and seller integration boundary

The buyer-owned v5.3 migration is implemented on `geoff/buyer`. Seller execution
is deliberately fixture-backed until Dev S integrates Fetch. This does not claim
that live peer negotiation, service concessions or the complete combined system
passed acceptance. No seller branch, external account or deployment was changed.

## What now runs

Independent openings → immutable common snapshot → moderator brief → one merchant
advocacy/challenge job each → one grouped reply per challenged merchant → checked
outcomes → every eligible competitive candidate invited to sealed finals →
independent research → deterministic shortlist → exact approval and simulation.

`src/contracts/index.ts` owns strict v2 council inputs/outputs and final wrappers.
Request/ordinary opening-offer shapes remain v1. `contracts:export` derives the
application and seller-worker JSON Schema, including `SellerFinalJobInput`.
Do not maintain another Python interpretation. `ChallengePlan` remains only as a
historical schema; new runs never execute the legacy moderator role.

`buyerRoles.ts` creates one persisted `buyerCouncils` row. Its public snapshot and
digest never change. Comparisons, admitted challenges, grouped replies, outcomes
and phase status are separate fields. Raw model output remains internal in
`buyerJobs`; public text is regenerated from validated references/facts. It does
not stream raw allegations, marketing prose or model verdicts. Fit comparisons
describe recorded checks rather than inventing a persuasion score.

Adjudication is conservative: missing replies and unsupported claim allegations
remain unknown. Proposed moderator findings cannot override recorded facts. The
buyer reuses S's `assessLine` and current merchant/listing checks to invalidate
mandatory contradictions; advisory uncertainty adds no numeric penalty. Research
can invalidate later, but cannot start another council or commercial round.

`buyerFinalInvitations` records every frozen candidate, including above-budget
ones. Finals have no usefulness/affordability gate. Invalidated or undispatched
candidates remain explicitly unavailable; missing/invalid finals retain only a
still-eligible prior offer. Round records pin council/snapshot digest and checked
outcome version. Receipt counts are public; staged prices are not.

The buyer enforces parent, listing identity, configuration/condition, quantities,
delivered total, shipping, arrival, warranty and return monotonicity. **Finals are
currently pricing-only.** A non-null serviceOptionId is rejected until S supplies
the specified versioned service authority/economics and exact quote/order support.
No policy prose grants an upgrade.

## Seller developer handoff

- Consume canonical `CouncilJobInput`, `SellerAdvocacy`, `SellerReply`,
  `SellerFinalJobInput` and `SellerFinalDecision` from the generated worker schema.
  Council outputs copy the full immutable envelope, including jobId, request/run,
  council/snapshot, digest, subphase and deadline. The root schema filename retains
  v1 for existing opening callers; individual council envelopes have version 2.
- B prepares jobs with `buyerRoles.prepareCouncilJobs`; the persisted merchant
  binding and `ownOffers` grant scope. Shared snapshot fields alone grant no
  arbitrary rival inventory, policy or job access. The seller implementation must
  authenticate its own tools and author references before handing results to B.
- Replace only the fixture invocation for `seller_advocacy`, `seller_reply` and
  final/initial seller roles with the consolidated seller dispatcher. B remains
  sole coordinator and owner of deadlines, retries, phase closure and publication.
  Do not also schedule a second poll/retry loop in S. Call the buyer completion
  boundary once with the expected job/result/provenance; callbacks remain internal.
- Advocacy is one job per merchant covering up to two own frozen candidates and
  at most one outgoing challenge. A reply receives its complete admitted target
  batch and must return exactly one answer per challenge. No reply-to-reply.
- For finals, **only `buyerJobs.input.sellerInput` may cross the provider port**.
  The surrounding payload has local fixture policy/catalog internals. The public
  input contains the frozen competition, checked outcomes, concrete comparisons,
  own public offer and policy reference, never private ceilings/costs/floors.
- The final wrapper binds round/candidate, council/snapshot and outcome version.
  Its proposal uses schemaVersion 2 and serviceOptionId=null for pricing-only
  support. B adapts that proposal to the imported v1 seller validator locally.
  The current wrapper's jobId is the imported S seller-job reference; B's distinct
  buyer job ID remains the completion/poll identity. S must coordinate its durable
  per-phase job migration and live provenance without creating duplicate work.
- Implement approved finalServiceOptions in S's policy/validator/configuration
  before enabling service improvements. Coordinate B's quote/order snapshot fields
  in the same integration change. The buyer currently rejects such options safely.

## Timing, failure and compatibility

New runs persist absolute end times: opening +35s, brief +45s, advocacy +55s,
reply +65s and adjudication +75s. Roles close early when responses finish. Finals
allow up to 30s, research up to 60s, summaries up to 15s, all inside the 210s run,
28 provider starts and 40 tool/poll calls. Repairs consume the same budget and
deadline. Polling cannot authorize a late result. Exhaustion yields checked
partial offers and unavailable invitation/phase counts, never a fabricated reply.

CREAO agent ID/model/config revision are snapshotted per job, so an ambiguous
start reuses the same request/key even if environment configuration later changes.
Every role uses an isolated conversation. Two saved agents suffice: Intake for
intake; Council for brief, adjudication and evidence_summary. These are separate
jobs, not one shared agent conversation across merchants or buyers.

Do not deploy midway through an active legacy run. Let earlier runs finish or
cancel them before updating the backend; old in-flight Workflow step graphs and
final payloads are not a live-resume compatibility promise. Completed requests,
orders and snapshots remain readable. New tables are additive; existing view
responses default missing council status fields. Seven-day retention also cleans
up council and invitation records after unresolved-execution safeguards.

Run `npx convex dev` against the intended development deployment to apply the
additive schema and regenerate bindings with the CLI; do not hand-edit generated
files. This checkout has no configured Convex deployment, so CLI deployment and
component-aware binding regeneration require that setup. Existing typed bindings
reference the updated modules and deterministic function tests cover the new schema.

## CREAO setup and verification

Use [Intake agent definition](creao/BUYER_INTAKE_AGENT.md) and
[Council agent definition](creao/BUYER_COUNCIL_AGENT.md). Configure the five backend
variables in [integration setup](BUYER_INTEGRATIONS.md). An account API key must
be able to invoke both saved agents. Keys are never VITE variables or chat text.

The adapter tests exercise starts, polls, cancellation, strict outputs, immutable
configuration and two-agent routing without paid calls. Backend tests exercise
actual function transactions/workflow components, privacy, candidate participation,
grouping, replay/late-output rejection, sealed publication, caps and checkout.
`npm run smoke:creao` checks local environment configuration only; `-- --live`
performs four potentially billable role calls on disclosed demo data. It checks
strict output plus scope/uncertainty behavior and records non-secret run IDs and
timing. It does not write a buyer request or certify hosted execution provenance.

Live CREAO smoke, deployed schema/auth, browser acceptance and combined Fetch
acceptance still require configured accounts/deployment. CREAO documents that
runs can take minutes; the agreed budgets are unchanged. The user permits the CREAO default model; its identity remains unverified when
unreported. An account-supported non-Gemini override is optional. Measure cold/warm latency. Do not claim live acceptance from
the deterministic suite or raise timeouts silently.
