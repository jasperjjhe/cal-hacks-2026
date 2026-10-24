# BuyerUnion buyer mock

A responsive React/TypeScript buyer workspace based on the current Figma designs.
Run it without provider keys or a deployed backend.

## Run locally

Use Node 24 (see `.nvmrc` and `package.json`), then:

```sh
npm run security:dependencies
npm ci --ignore-scripts
npm run dev
```

Open the local URL printed by Vite. The “A laptop for school” example provides a
sample prompt, a proposed $1,000 private ceiling and a delivery date five days out.
Review and explicitly confirm the brief, watch the scripted progress, compare
sample offers, choose one and approve its three-minute simulated quote.

Other examples cover a cotton tee, shelf and kettle. The catalog is intentionally
small; low budgets or tight deadlines can produce an honest no-match state.

## Implemented mock behavior

- Navy sidebar/home, prompt entry, persistent conversation, suggested replies and
  editable confirmation with separate optional shared-target consent.
- Scripted merchant progress, delivered prices, condition filtering, delivery
  checks, ordering, saved offers and side-by-side comparison.
- Offer detail with source references and explicit missing owner evidence.
- Three-minute quotes, expiry/recheck, explicit simulated approval, duplicate-order
  protection, receipt and local order history (latest 100 simulations).
- Responsive layout, keyboard-accessible controls, native modal focus handling,
  reduced-motion support, and reload recovery via versioned browser storage.

This is a **browser-only mock**. It is not authenticated, does not reserve real
stock, perform live language extraction, acquire evidence, contact CREAO, run
Convex Workflows, or charge money. Source links are references, not proof that
live retrieval occurred. Product photos are illustrative, not exact variant
verification. Fixed sample matching and qualitative preferences are disclosed
when confirming. Do not enter private personal data.

The audit fixes preserve journey state when navigating away, reset target consent
on revisions, recheck delivery against the selection date, and store immutable
quote/order snapshots. Legacy local quotes without snapshots require reselection;
legacy order totals remain visible without reconstructing missing past terms.
The detailed review and remaining backend gates are in
[`IMPLEMENTATION_REVIEW.md`](../docs/IMPLEMENTATION_REVIEW.md).

The mock does not replace the planned server enforcement. Browser state is
editable and never an authorization mechanism. Replace mock operations with the
owner-scoped Convex API before treating them as real commerce behavior.

## Design reference and update practice

Figma: https://www.figma.com/design/anisZ6onqrgSdZMnzbjBuf

- Current home: `53:1134` (navy sidebar, prompt and photo-based offer cards).
- Chat: `19:225`; progress: `19:226`; comparison: `13:85`; approval: `19:228`.
- Local photo assets in `public/images/` come from the current home design.
- Recheck metadata and design context at the start of work, after major screen
  milestones, and before handing off. The user clarified that Figma is a layout
  and color reference only: responsiveness, interactions, accessibility and
  overrides use implementation judgment. Keep the implementation plan
  authoritative for privacy, eligibility and purchase rules.
- October 24 implementation recheck: home layout/content unchanged between initial
  and final high-fidelity fetches; temporary asset URLs refreshed.

The mock follows the newer sidebar home and adapts older journey screens to that
workspace. It corrects illustrative Figma copy that exposed the private ceiling,
used unsupported review scores, offered an unaffordable quote, or implied an
18-minute hold/real Visa payment. It uses the PRD's disclosed merchant fixtures
instead of treating design product names/prices as verified catalog records.

## Checks

```sh
npm run test:buyer
npm run contracts:check
npm run lint
npm run build
npm run ci
```

`test:buyer` covers shared contracts plus mock confirmation/matching, safe money,
expiry, revisions, duplicate approvals and restored state. `ci` also runs the
release-age policy, workflow policy, npm signatures and vulnerability audit.

For shared contracts and integration boundaries, see
[`docs/BUYER_BACKEND_HANDOFF.md`](../docs/BUYER_BACKEND_HANDOFF.md) and the active
[`BUYERUNION_IMPLEMENTATION.md`](../BUYERUNION_IMPLEMENTATION.md). CREAO is selected
for buyer roles; the live adapter and Convex deployment remain future work.
