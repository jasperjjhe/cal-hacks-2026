# Buyer/seller integration notes

This note records the boundary observed while cross-referencing `origin/geoff/buyer` with the seller branch. It is a merge aid, not a second product specification; `BUYERUNION_IMPLEMENTATION.md` remains authoritative.

## Latest compatibility audit

The latest fetched buyer reference is `origin/geoff/buyer` at `64884dc`
(`feat: add buyer provider adapters and specify council v5.3`). It is tracked
as a compatibility reference, not a merge target to apply wholesale. The
branch still has the v1 `SellerProposal`/`SellerDecision` contracts and legacy
`ChallengePlan`, `PriceRound` and `FinalSubmission` shapes; it does not yet
publish the canonical v2 council envelopes required by the active spec.

The current shared-file drift is material:

- `frontend/convex/buyerJobs.ts` currently runs seller fixture work directly
  and calls `internal.sellerInternal.validateAndStoreProposal` with
  `deferPromotion`; the seller branch's validated internal seam does not yet
  accept that argument. This call must be resolved before integration.
- The buyer branch removes `sellerAgent.ts`, `sellerJobInputs`, provider
  lifecycle metadata and the `starting`/`polling`/`ambiguous` states. A direct
  schema merge would remove Fetch dispatch, polling, reconciliation and
  failure recovery. Preserve the seller provider path and reconcile the buyer
  workflow to it instead.
- Its `policyVersions` and `offerVersions` projections omit the seller
  branch's `finalServiceOptions` and `serviceOptionId`. Those fields must
  survive the unified schema; old policies remain valid with an empty option
  list.
- The buyer branch changes seller functions to generic Convex APIs and adds
  auth/operator binding. Those changes need a deliberate merge with the
  seller authorization and generated API; do not overwrite seller ownership
  or hand-edit generated bindings.

Until the buyer branch publishes v2 contracts and these seam differences are
resolved, the seller branch must keep its v1 Fetch worker and must not enable
new council role names.

The active Markdown specification remains normative while the buyer developer
continues implementation. If `origin/geoff/buyer` lags, contradicts or omits
documented v5.3 behavior, treat that branch state as incomplete work—not as a
change to product requirements. Seller work may implement documented,
seller-owned deterministic rules now, but the seller branch must still consume
the buyer-owned canonical v2 source for the final wire migration rather than
creating a parallel schema.

## Required handoff

The buyer workflow owns the request, run, phase and provider-call budget. For each participating merchant it must build an allowlisted `SellerBrief`, prepare one seller job, attach the brief if preparation and input storage are separate, and invoke one internal seller action. The seller action returns status/provenance; the buyer workflow decides when to continue the phase or create the one permitted repair.

## v5.3 council handoff

The active council is independent opening offers -> one immutable common public
snapshot -> checked comparative briefs -> one seller advocacy/challenge job per
merchant -> one grouped reply per challenged merchant -> checked outcomes -> one
sealed final invitation per still-eligible candidate -> independent research.
The buyer workflow remains the sole coordinator and the seller branch remains
the sole owner of seller-scoped catalog, policy and final-decision validation.

The buyer-owned canonical contract source must add the v5.3 schema-versioned
envelopes before either worker enables the new roles. Request schemas remain
version 1; council envelopes use version 2. The seller branch must derive its
Python parsing, fixtures and provider input from that source rather than adding
a second handwritten interpretation.

Seller jobs may receive the immutable `CompetitionSnapshot`, checked public
comparative points/outcomes, the seller's own frozen candidates and private
policy/catalog context. Seller jobs may produce only scoped defenses/challenges,
grouped replies, or parent-bound final decisions. They cannot adjudicate,
rank/remove rivals, browse for new facts, reopen the council or expose sealed
terms. B validates cross-offer references, approved facts, challenge routing,
phase membership and public event safety; S validates seller authorship, own
offer references, policy authority, frozen-basket invariants and economics.

The seller branch has now added the policy-side service authority and a pure
seller validation seam needed by the v5.3 final phase without inventing a v2
wire schema: `PricingPolicy` versions store an immutable
`finalServiceOptions` allowlist, `resolveFinalServiceTerms` accepts only a
server-authorized option ID (or `null` for baseline), accepted offer versions
carry `serviceOptionId`, and `validateFinalOfferRevision` checks the accepted
opening offer, parent/frozen-basket scope, current brief fit, stock, price
floors, private incremental contribution, delivered-total monotonicity and
term monotonicity. The buyer-owned v2 envelope must still supply the parent
offer, frozen basket and final proposal before Convex persistence and the Fetch
worker can enable the migrated role.

Seller entry points:

- `internal.sellerInternal.prepareSellerJob`: binds the job to the merchant, policy, candidate IDs and workflow identifiers. It accepts an optional `brief` for an atomic handoff.
- `internal.sellerInternal.attachSellerBrief`: idempotently stores the sanitized brief when the buyer has prepared the job first.
- `internal.sellerAgent.dispatch`: starts a configured Fetch/CREAO job, polls pending runs and validates terminal `SellerDecision` output.
- `internal.sellerAgent.reconcile`: resolves an ambiguous start through the configured application-job reconciliation endpoint.
- `internal.sellerAgent.cancel`: best-effort provider cancellation followed by a server-owned cancelled state.
- `internal.sellerInternal.validateAndStoreProposal`: deterministic seller validation and immutable offer persistence; it never closes the buyer workflow.

## Merge hazards found on `origin/geoff/buyer`

- The buyer dispatcher currently calls seller preparation without the new optional `brief` field. Use `attachSellerBrief` or pass the brief in the preparation call before dispatch.
- The buyer dispatcher currently maps every live agent role to CREAO. That is acceptable for buyer-owned roles, but a seller job configured for Fetch must use `sellerAgent.dispatch` and must not also be started by the buyer's generic provider dispatcher.
- Both branches contain generated Convex bindings. Regenerate them once after the unified schema/function set is merged; do not hand-edit `_generated` files.
- The buyer branch has its own buyer-job provider reference and retry state. Keep that state separate from `sellerJobs.providerRunId`; bridge them with the immutable seller job ID and the buyer completion handler.
- The current buyer branch still contains the baseline moderator/contract shape. Do not enable v5.3 role names against it. First update `frontend/src/contracts/index.ts`, its schema/fixtures and buyer council persistence, then regenerate the seller worker boundary from that resolved source.

## Data boundary checks

The seller provider input may contain the confirmed public requirements, candidate IDs, the seller's own catalog and inventory facts, MSRP/reference price, public service terms, and the explicit allowlisted common competition snapshot plus checked outcome references for the active v5.3 role. It must not contain raw buyer messages, origins, private maximums, arbitrary competitor records, competitor costs/floors, private affordability, private rationale or sealed final submissions. The seller response is untrusted until the server recomputes the offer and, for council roles, checks the parent snapshot, author scope and phase rules.
