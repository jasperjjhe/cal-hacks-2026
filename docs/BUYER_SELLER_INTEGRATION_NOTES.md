# Buyer/seller integration notes

This note records the boundary observed while cross-referencing `origin/geoff/buyer` with the seller branch. It is a merge aid, not a second product specification; `BUYERUNION_IMPLEMENTATION.md` remains authoritative.

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

The seller branch has now added the policy-side service authority needed by the
v5.3 final phase without inventing a v2 wire schema: `PricingPolicy` versions
store an immutable `finalServiceOptions` allowlist, `resolveFinalServiceTerms`
accepts only a server-authorized option ID (or `null` for baseline), and
accepted offer versions carry `serviceOptionId`. The buyer-owned v2 envelope
must still supply the parent offer, frozen basket and final proposal before the
seller can enable contribution, monotonic-total and weakened-term checks.

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
