> Historical mock review. For the current persisted backend and the resolution
> of the final branch review, read [BUYER_REVIEW_RESOLUTION.md](BUYER_REVIEW_RESOLUTION.md)
> and [BUYER_BACKEND_HANDOFF.md](BUYER_BACKEND_HANDOFF.md). Statements below about
> the backend being absent describe the earlier mock implementation.

> Historical review of the offline mock. The backend was subsequently implemented
> and all work moved to `geoff/buyer`; `dev` was restored to its original commit.
> See [BUYER_BACKEND_HANDOFF.md](BUYER_BACKEND_HANDOFF.md) for the current system.

# Buyer implementation review — October 24, 2026

The implemented buyer mock had actionable lifecycle, privacy-projection, consent,
delivery and recovery defects. The findings below are fixed locally on `dev`.
No P0 was found. This assessment does **not** certify the planned buyer backend:
it has not been implemented or connected.

## Review scope and authority

Reviewed the entire working implementation against `HEAD` (`609e53e`), including
untracked contracts, source, generated schema, fixtures, tests and handoff notes;
also inspected surrounding configuration, dependency/CI changes, assets and CSS.
Reread active implementation v5.2, product brief, archived v4 context, security
policy and branch/deployment instructions. v5.2 supersedes v4; the user's later
instructions authorize the UI mock, select CREAO, defer Convex deployment, and
make Figma a layout/color reference rather than exact behavior authority.

Used the supplied review-agent procedure. The user's explicit fix request
supersedes its read-only instruction. No review was delegated, no external
comments were posted, and no changes were pushed or deployed.

## Fixed findings

### [P2] Require finalized results before issuing a quote — frontend/src/buyer/mock.ts:385

A buyer could start checking, navigate to Overview, open a preview and reserve
before the checking stage finished. `confirmed` plus a start timestamp was enough.
Selection now requires the current journey to be results/approval; previews that
aren't eligible open a new brief rather than bypass confirmation and checking.

### [P2] Recompute delivery when refreshing a quote — frontend/src/buyer/mock.ts:385

Selection always used the original run timestamp. A request due October 25 still
received a fresh quote on October 26. Selection now checks arrival from the
current date, stores its delivery-date snapshot and rejects missed deadlines.
Calendar-day arithmetic also handles San Francisco clock changes; adding 24 hours
could previously shift arrival by an entire calendar date.

### [P2] Reset target-sharing permission on request revision — frontend/src/buyer/mock.ts:559

After consenting to share a target, changing the budget or sending a new message
retained the checked permission and old target in the next request version.
Revision now clears both. Entering a target after checking the new consent box
preserves that new consent; no target is silently carried across a revised brief.

### [P2] Remove private prose from seller projections — frontend/src/backend/buyer/requests.ts:55

Omitting `privateMaximumCents` did not prevent a confirmed `useCaseSummary` from
containing “my private maximum is $1,000” and being copied into SellerBrief.
Projection now creates a neutral summary from typed category/quantity fields,
while retaining structured requirements. No vendor exposure was observed because
no live seller adapter exists. Profile-backed, reviewed goal templates are needed
to restore richer public use cases safely; this is not complete semantic privacy
validation of arbitrary requirement values.

### [P2] Preserve the active journey across workspace navigation — frontend/src/buyer/mock.ts:531

The page field was also the workflow state. Visiting Settings stopped the progress
timer, and “Find a bundle” returned to intake instead of the current comparison or
quote. A separate persisted journey stage now survives navigation, completes
checking off-screen, and resumes without discarding the quote. Local comparison
selections are cleared on context changes instead of leaking between views.

### [P2] Snapshot exact quote and order terms — frontend/src/buyer/mock.ts:424

Quotes/orders stored IDs and totals while approval and history rendered the
current mutable catalog. Updating a configuration or warranty could silently
change the apparent approved terms. New quotes and orders store full sample
snapshots; changed commercial/configuration terms require reapproval. Comparison
uses stable term fields, so JSON key order after reload and display-copy changes
do not invalidate an otherwise valid quote. Legacy quotes without snapshots must
be rechecked; legacy order totals remain preserved without invented past terms.

### [P2] Apply suggested replies through the same message path — frontend/src/buyer/mock.ts:280

Clicking “Battery first” updated the proposed preference; typing the same text did
not. Suggested chips also incremented the draft version twice. Exact supported
reply text now updates through `sendMessage` for both interaction paths, creating
one revision and the same proposed brief.

### [P2] Display selection failures inside the active dialog — frontend/src/App.tsx:1406

A failed selection set the global error banner behind the modal, leaving the buyer
with no visible explanation. Offer details now display their own live error; the
global banner is suppressed while that dialog is open. Browser testing advanced
the test clock past delivery and confirmed the rejection remains visible inside
the dialog with no quote issued.

### [P2] Show required service terms on comparison cards — frontend/src/App.tsx:173

Cards hid delivery, warranty and returns until the buyer opened each detail or
comparison dialog. Those are required first-level tradeoffs, especially when the
same variant is offered by multiple merchants. Cards now show all three alongside
the delivered price and condition.

### [P2] Explain the actual no-match constraint — frontend/src/buyer/mock.ts:364

An empty result only said offers might be too expensive or late. It didn't tell
the buyer what to edit. No-match output now reports the lowest qualifying delivered
price or the earliest affordable arrival that misses the confirmed deadline,
without relaxing any requirement.

### [P2] Keep bounded history restorable after repeated orders — frontend/src/buyer/mock.ts:424

The writer could append order 101 while the restore schema rejected more than 100,
resetting the entire workspace on reload. The local demo history is now bounded
to its latest 100 orders at write time; a regression verifies the newest receipt
and workspace remain restorable.

### [P3] Accept a valid same-day delivery request — frontend/src/buyer/mock.ts:332

The form and validator rejected today even though the requirement is to reject
past dates. Today now confirms as a valid date and honestly produces no matching
sample stock when none can arrive that soon. Invalid calendar dates are rejected.

### [P3] Keep new chat replies in view — frontend/src/App.tsx:228

The bounded message pane stayed at the top as messages were appended, hiding new
replies once it overflowed. It now scrolls to the latest reply on message changes
and when resuming chat; browser verification confirmed the pane ends at the bottom.

### [P3] Correct the receipt label's contrast — frontend/src/App.css:976

The receipt's small teal label failed automated color contrast at 3.87:1 on white.
Its text color is darker while the brand palette remains intact. The repeated
receipt scan reports zero automated violations, with icon checks still requiring
manual judgment.

## Verification

- Five newly added regressions failed on the original implementation before fixes.
- Focused tests cover phase guards, navigation/reload, revised consent, typed reply
  parity, fresh delivery, spring/fall clock changes, term snapshots, legacy state,
  no-match explanations, bounded history and private-summary projection.
- Real-browser checks: typed preference, consent reset, navigation during checking,
  resumed results, stale-delivery error inside the modal, valid quote reload,
  explicit simulated approval and one stored order with a snapshot.
- Mobile receipt at 390px: no horizontal overflow and no Vite error overlay.
- Receipt accessibility rescan: zero automated violations. This is a scoped scan,
  not a complete keyboard/screen-reader or WCAG certification.
- Full repository CI passed: 24 buyer tests, four security tests, dependency/
  workflow policies, npm signatures (no invalid or missing signatures), audit
  (zero vulnerabilities), generated-schema consistency, lint and production build.

The T3 shared preview still reports missing host browser libraries. Verification
used an isolated agent-browser session with temporary extracted libraries; no
system package installation or privileged host change was made.

## Remaining concerns and recommended next actions

1. **Complete F0 with Dev S before integration.** Shared schemas remain a subset,
   not a frozen backend API. Agree profile IDs/units, sanitized public goals,
   role outputs, seller validation, allocation helpers, pagination/sort commands,
   quote snapshots and the full UI fixture bundle. Avoid independent copies.
2. **Implement B1/B2 against Convex locally before live deployment.** Authenticated
   ownership, durable stages, immutable request versions, idempotency keys,
   transactional reservations/allocations and unknown/decline reconciliation are
   absent. The browser mock is editable, single-workspace state; it supplies no
   cross-buyer isolation, stock contention guarantees or cross-tab transaction
   safety. Deferring deployment does not satisfy these implementation gates.
3. **Connect a tested CREAO buyer adapter and S's seller adapter.** No real agent
   execution occurred. Verify the actual project/agent API, supported non-Gemini
   reasoning, job provenance, pending/completed semantics, retry/reconciliation
   and server-side credential handling before claiming runtime integration.
4. **Add real evidence plus adversarial acceptance tests.** Current sources are
   links, not retrieved evidence. Test a laptop and a genuine non-tech identity,
   applicability, unavailable/partial states and injection defenses. Fixed sample
   matching does not interpret every hard requirement in an arbitrary prompt;
   that remains disclosed mock behavior and must not become production matching.
5. **Keep the UI replaceable.** `App.tsx` still combines multiple screens and
   modal state. Introduce a buyer service adapter and split screens as the real
   API is wired; don't copy the local mock's business logic into Convex or fork
   Dev S's pricing/eligibility/stock functions. Keep browser journey tests in CI
   when browser infrastructure is available.
6. **Leave optional commerce/hosting work behind the core gates.** Visa, Coinbase
   and Mana have no verified runtime integration. Do not treat this review or a
   successful fixture checkout as proof of provider use, real inventory authority,
   actual payment, deployment readiness or sponsor eligibility.

TLDR: concrete mock defects were corrected and regression-tested. The primary
remaining work is the shared-contract freeze and actual Dev B backend, followed
by real CREAO/evidence integration and authenticated end-to-end acceptance tests.
