# Buyer council v2 implementation and seller integration boundary

The buyer-owned v5.3 migration is implemented on `geoff/buyer`. The standalone
buyer branch remains fixture-backed for seller execution; the merged
`feature/seller-side` checkout adds the single Fetch dispatch/result bridge when
its gateway is configured and keeps fixture fallback for CI/demo. This does not
claim that live peer negotiation, service concessions or the complete combined
system passed acceptance. External provider accounts and deployment still need
configuration.

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

User-approved MVP waits now persist absolute end times: opening +30s, brief +120s,
advocacy +150s, reply +180s and adjudication +270s. Each CREAO moderator role and
intake/summary call allows up to 90s; phases close early on completion. Finals
allow up to 30s, research up to 60s, all inside an eight-minute (480s) run,
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

Live CREAO role checks now pass as recorded below. Deployed schema/auth, browser
acceptance and combined Fetch acceptance remain pending. CREAO documents that
runs can take minutes; the user approved the longer MVP waits after live timing checks. The user permits the CREAO default model; its identity remains unverified when
unreported. An account-supported non-Gemini override is optional. Measure cold/warm latency. Do not claim live acceptance from
the deterministic suite or raise timeouts silently.

## Live CREAO check — October 24, 2026

Connected to the user-selected Convex dev deployment little-dove-539. Corrected
CREAO_BUYER_CONFIG_REVISION from coucil-v2 to council-v2. Agent IDs/key were read
into process memory only; no provider secret was printed or committed.

Default model selection is supported by omitting chatModelId. The provider did
not report its model identity. Two diagnostic runs completed in about 47s/57s:
intake `63534a33-dd93-4cf5-807f-3f6214194dfb` and comparative brief
`3a65b490-9d0e-4ead-bb1e-97141c116c05`. Both actual outputs passed strict schemas
and smoke semantic checks after the adapter was corrected to read JSON artifacts.
CREAO's result.text contained summary counters and chatText contained narration;
the JSON lived in an application/json artifact. Downloads are restricted to the
same run's authenticated CREAO endpoint and one observed CREAO storage bucket
redirect, with no API-key forwarding to storage. Bodies remain bounded.

The former 30s/10s checks timed out and those runs were confirmed cancelled.
The user approved longer MVP waits; this does not certify combined deployed
buyer/seller behavior. Updated code still requires deployment to the intended
buyer backend; no shared deployment functions or commerce records were overwritten.

With the revised waits and artifact reader, the remaining roles also passed live
schema/semantic validation: adjudication `b34f418b-2504-4eb5-bb68-357ebed3cf50`
in about 31s, and evidence summary `4ebb6fdc-0a6e-422c-83b1-dd93b8c7150f`
in about 46s. All four buyer roles have real default-model output proof on demo
inputs. This is provider integration proof, not a deployed browser/order test.
