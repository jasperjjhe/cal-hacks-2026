# Buyer/seller integration notes

This note records the boundary observed while cross-referencing `origin/geoff/buyer` with the seller branch. It is a merge aid, not a second product specification; `BUYERUNION_IMPLEMENTATION.md` remains authoritative.

## Required handoff

The buyer workflow owns the request, run, phase and provider-call budget. For each participating merchant it must build an allowlisted `SellerBrief`, prepare one seller job, attach the brief if preparation and input storage are separate, and invoke one internal seller action. The seller action returns status/provenance; the buyer workflow decides when to continue the phase or create the one permitted repair.

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

## Data boundary checks

The seller provider input may contain the confirmed public requirements, candidate IDs, the seller's own catalog and inventory facts, MSRP/reference price, and public service terms. It must not contain raw buyer messages, origins, private maximums, competitor information, operator floor, unit costs or minimum contribution. The seller response is untrusted until the server recomputes the offer.
