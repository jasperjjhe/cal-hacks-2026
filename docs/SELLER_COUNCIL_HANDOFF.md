# Seller council v5.3 — agreed format and implementation handoff

Status: user-confirmed specification, October 24, 2026. The seller-side v2
contract/worker/Convex bridge is now implemented on `feature/seller-side`; this
document remains the normative format and acceptance handoff, not live-provider
proof. It was originally published to `dev` from `geoff/buyer` so both
developers could consume the agreed format without merging buyer implementation.
The active product/technical authority is
[implementation spec v5.3](../BUYERUNION_IMPLEMENTATION.md), sections 5.7 and 9.
Historical review/test results do not establish acceptance of this new protocol.
Implementation paths and baseline behavior below describe the feature branches,
not code delivered by this documentation-only commit to `dev`.

## Agreed product flow

Independent opening bids → identical frozen public offer snapshot → checked
comparative briefs → one merchant defense/challenge each → one grouped reply
per challenged merchant → checked outcomes shared with all → one sealed final
offer per eligible candidate → independent research → deterministic comparison
→ buyer selection and exact approval.

- At most three merchants and two candidates each. A snapshot may have six
  candidates; final buyer cards remain capped at five. Above-budget offers that
  pass policy/hard requirements participate without exposing affordability.
- Public means this run's approved participant projection, not an unauthenticated
  global endpoint. Product/configuration/condition/quantity, delivered price,
  shipping, delivery, warranty/returns and checked fit/claims are visible.
- Each merchant gets one outgoing peer challenge, not one per candidate. Each
  target gets one grouped reply covering its admitted incoming challenges.
  Unchallenged merchants need no reply; there is no rebuttal to a reply.
- No private ceiling, affordability/selectability flags, raw prompt/origins,
  floors/costs, private strategy or rival worker state enters the snapshot.
  Opening bids stay independent; sealed final revisions stay private until close.
- Every still-eligible candidate gets a final invitation. Remove the old
  usefulness/affordability gate. Hold/abstain is valid; no forced discount.
- Freeze goods/configuration/condition/listing or unit identity and quantities.
  Price reductions and explicitly policy-granted service improvements are allowed;
  higher delivered totals, weaker terms and substitutions are rejected.
- Use approved facts/specifications and evidence already available. No new
  seller browsing. Later independent research may invalidate offers but does not
  reopen competition. A research refill uses existing validated frozen candidates,
  not a newly substituted product or another bidding round.
- Unsupported accusations and missing replies are not penalties or admissions.
  Only authoritative validated facts change deterministic checks/ranking.
- Buyers see short checked exchanges as available, plus a final change/uncertainty
  summary. Up to three useful highlights are recommendations, not debate winners;
  the remaining qualified shortlist is accessible. Buyer authority is unchanged.
- Preserve 210 seconds total, 28 model calls, 40 tools and phase deadlines;
  finish early or return usable partial results. The former 45-second complete
  comparison target is withdrawn pending real cold/warm measurements.

## Current implementation versus target

| Area | Existing baseline | Required v5.3 change |
| --- | --- | --- |
| `buyerRoles.ts` / moderator | Moderator authors one claim challenge per merchant | Checked comparative brief and adjudication roles; sellers author scoped peer challenges |
| `buyerJobs.ts` | Own offer plus generic final-improvement feedback | Explicit common snapshot, peer offer references, merchant advocacy and grouped reply inputs; concrete comparisons from checked public facts |
| `buyerWorkflow.ts` | Single council response phase; usefulness-gated finals | Persist advocacy/reply/adjudication subphases, invitations and closures; invite every eligible competitive candidate |
| Runtime contracts / worker schema | `ChallengePlan`, `seller_response`, baseline seller decisions | Coordinated v2 council envelopes/roles, public snapshot, typed challenges/replies/outcomes, invitation records and final service authority |
| Seller Fetch worker on the seller branch | Deterministic product/reference-price proposal; no verified full council | Implement role-aware defense/challenge/grouped reply and parent-bound final decisions; no new product during finals |
| Buyer events/UI | Earlier safe progress and summary | Publish only checked short public exchanges and real phase counts; preserve sealed prices and privacy |
| Service revisions | Terms derived from baseline policy | Versioned permitted service options, private incremental cost/contribution checks and exact offer/quote/order snapshots |

The buyer branch currently keeps seller roles as fixtures while CREAO can serve
buyer roles. Do not enable new role names against the current adapter or treat
its legacy moderator prompt as this council. Provider code/configuration and
live runs must be upgraded after the canonical contracts are implemented.

## Ownership and integration sequence

1. **B maintains, S reviews the canonical contracts.** Implement spec 5.7 in
   `frontend/src/contracts/index.ts`; derive seller wire parsing and exported
   schemas from it. Leave unchanged request schemas at version 1; new council
   envelopes are version 2. Update golden fixtures and worker validation together.
   Do not add a second handwritten Python/TypeScript contract interpretation.
2. **B publishes the immutable common snapshot.** Use an explicit field allowlist,
   never an entire buyer/card/private-offer record. Admission depends on public
   eligibility, not budget. Persist participant/candidate refs and digest once
   opening bids close. S provides public facts and own-private-tool access only.
3. **B coordinates; S executes merchant roles.** B checks moderator briefs,
   prepares one advocacy job per merchant, admits scoped challenges, then freezes
   one incoming batch per target. S dispatches only its authenticated merchant
   job. B checks replies/outcomes and advances the expected subphase. All jobs pin
   request/version, run/council, snapshot/digest, phase and deadline. Provider
   transport, polling and retries have one owner to prevent duplicate starts.
4. **S validates finals inside B's sealed lifecycle.** Enforce candidate parent,
   frozen basket, policy authority, total/term monotonicity and stock/fit rules.
   Add typed `serviceOptionId` and immutable policy `finalServiceOptions` with
   private incremental costs before enabling service concessions. Old policies
   grant no service upgrades. B records every invitation, hides submissions and
   promotes valid versions atomically on closure. Recheck pause/policy/eligibility;
   invalidated offers never return through a hold or fallback.
5. **B publishes checked events and results.** Validate public statements before
   emission. Missing/timeout outcomes are explicit. Distinguish public tradeoffs
   from private affordability; preserve deterministic ranking and buyer approval.
   Later evidence can remove eligibility without restarting competition.
6. **Both integrate and verify.** Preserve buyer auth/recovery, canonical schemas,
   aggregate stock fixes and final deferred promotion while merging seller
   provider additions. Regenerate Convex bindings/schema exports from the resolved
   source. Update saved provider prompts/config revisions, then test fixtures and
   live role runs. This document does not authorize a merge, push or deployment.

## Required acceptance before claiming the format works

- All participants receive the same frozen public snapshot. Changing only the
  private maximum leaves snapshot, comparative briefs and final invitations
  unchanged. No private fields appear recursively in provider inputs/events.
- Independent opening jobs cannot see rival bids; council roles see only the
  frozen public competitor projection. Arbitrary rival inventory/policy/job reads
  remain forbidden. Concurrent final submissions reveal no revised terms early.
- An otherwise valid above-budget candidate can become affordable via a permitted
  final reduction; current affordability is computed privately and only governs
  buyer selection. A merchant at its floor can hold without penalty.
- Enforce one outgoing challenge per merchant, one target reply batch and no
  reply-to-reply even when both candidates or two rivals challenge one merchant.
  Reject forged authors, foreign offer refs, invented fact/source/challenge IDs,
  duplicate/mismatched output and late subphase results.
- Checked comparisons distinguish equivalent and different bundles. A claim such
  as “$50 less” is recomputed from pinned totals; unsupported superiority and
  guaranteed-win promises are rejected. No invented sources or fresh seller crawl.
- One seller attacking another without evidence cannot remove or down-rank it.
  Missing reply is unanswered, not false. A validated mandatory contradiction
  blocks selection through deterministic rules; unresolved advisory uncertainty
  is displayed without an invented numeric penalty.
- Every eligible candidate receives an invitation even when no concession is
  predicted. Missing/invalid finals retain only a still-valid prior offer.
  Reject substituted goods/quantities, increased totals, weakened terms and
  ungranted upgrades. Accepted service options preserve verified economics and
  exact terms through quote/approval/order.
- Persist/reload every phase. Budget exhaustion, provider failure, merchant pause,
  changed policy and cancellation close safely with real partial/missing-work
  labels. Reduced participation is disclosed without inventing competition.
  No old callback or later research starts another commercial round.
- Buyer events contain only checked public exchanges until finals close. No raw
  allegation, private reasoning, ceiling or sealed price appears in previews,
  seller queries, logs, bookmarks or archived event reads.
- Same facts/preferences produce the same deterministic shortlist regardless of
  rhetoric. Highlights do not become compulsory winners or hide qualified options.
- Record deterministic acceptance and a separate live run with actual snapshot,
  challenge/reply/final provenance, latency and limitations. Existing passing
  tests, provider registration and keys are not proof of this revised format.

## Seller-branch documentation sync

When the main conversation resumes consolidation, port the v5.3 references and
acceptance gates into the seller branch's `SELLER_IMPLEMENTATION_PLAN.md`,
`SELLER_SPONSOR_PROOF.md`, `BUYER_SELLER_INTEGRATION_NOTES.md`,
`SELLER_FETCH_CONFIGURATION.md`, `LOCAL_CONTEXT.md` and
`agents/fetch-seller/README.md` where present. Replace blanket bans on all
competitor information with an explicit distinction between the approved public
snapshot and forbidden private/arbitrary cross-merchant access. Replace legacy
moderator-authored challenge/usefulness-gate claims and record implementation
gaps honestly. Those branch-only files have not been edited in this checkout.
