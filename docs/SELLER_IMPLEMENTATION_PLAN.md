# BuyerUnion seller-side implementation plan

Status: active working plan for `feature/seller-side`, branched from `dev` on October 24, 2026.

## Source of truth

Per-turn project state, compliance checks, branch/deployment status, sponsor
decisions, and next steps are maintained in [`LOCAL_CONTEXT.md`](LOCAL_CONTEXT.md).

The active implementation contract is `BUYERUNION_IMPLEMENTATION.md`, especially sections 3, 5, 5.7, 6, 7, 8, 9, 11, 12, 15, 16, 17, 19 and 20. The PDF product brief and the v4 Markdown conversion were read before this plan was created. `buyerunion-prd-v4-source.md` is an archive of historical decisions; it is not an alternate active implementation plan. The v5.3 council wire envelopes are published in the buyer-owned contract source at `origin/geoff/buyer` `df26d70` (introduced at `d863b16`), and this seller runtime now consumes that source through the unified Convex/Fetch bridge; live deployment evidence remains external.

The seller-side implementation must preserve the buyer-side ownership described by the active handoff. A future buyer-side contributor will integrate through versioned contracts and Convex internal functions; this branch must not create a second workflow, buyer request store, evidence store, checkout authority or competing source of truth.

## Seller-side scope

This branch owns:

- merchant membership and seller authorization boundaries;
- category profiles, products, variants and provenance-aware catalog data;
- immutable listing versions and seller pricing/service policies;
- deterministic requirement eligibility, fit facts, delivered-price validation and seller-safe rejection reasons;
- seller proposal validation and immutable offer versions;
- seller participation in the moderated council: scoped defenses/challenges, grouped replies and parent-bound sealed final decisions;
- immutable policy-authorized final service options and their private incremental contribution checks;
- inventory availability, reservations and allocation transitions used transactionally by the buyer lifecycle;
- seller job input/output contracts and provider-neutral Fetch.ai/CREAO adapters;
- a seller operator view/query surface that exposes only the operator's own merchant data;
- fixtures, tests and evidence artifacts proving the above behavior.

The later buyer-side branch owns requests, raw buyer messages, private maximums, confirmation, run/workflow stage, council coordination, evidence acquisition, comparison projection, quote approval and execution. Seller code receives a sanitized `SellerBrief`; it never receives the raw prompt, requirement provenance or private maximum. During v5.3 council phases, seller code may receive only the immutable, allowlisted public competition snapshot and checked public outcomes for the current run, plus its own private catalog/policy context. It must never receive arbitrary rival records, rival costs/floors, private affordability or sealed revisions.

## Planned repository layout

```text
frontend/
  convex/
    schema.ts                 # seller tables plus future buyer tables in one schema
    seller.ts                 # public operator queries/mutations only
    sellerInternal.ts         # buyer/workflow integration seam; never browser-callable
    sellerJobs.ts              # job-bound proposal validation and completion transitions
    sellerAgent.ts             # internal provider action: start/poll/reconcile/cancel
    sellerInventory.ts        # transactional allocation helpers
    sellerPolicy.ts            # policy versions and deterministic checks
    lib/
      sellerContracts.ts       # canonical runtime-safe domain shapes
      sellerValidation.ts      # pure validation and pricing rules
      sellerFixtures.ts        # synthetic, clearly labelled demo fixtures
    integrations/
      agentProvider.ts         # provider-neutral port and provenance types
      fetchAdapter.ts          # Fetch.ai transport adapter; no secrets in source
      creaoAdapter.ts          # CREAO run adapter; async status/callback rules
  scripts/
    test-seller.mjs            # dependency-light contract/domain tests if needed
agents/
  fetch-seller/
    agent.py                   # Agentverse-compatible Fetch seller uAgent
    seller_logic.py            # dependency-free bounded catalog matching
    test_seller_logic.py       # pure Python security/decision tests
docs/
  SELLER_IMPLEMENTATION_PLAN.md
  SELLER_SPONSOR_PROOF.md
```

## Implemented checkpoint

The first seller-only checkpoint is now implemented on `feature/seller-side`:

- `convex/lib/sellerContracts.ts` is the canonical seller contract/runtime boundary. It allowlists `SellerBrief`, rejects unknown fields, and rejects raw prompts, origins, private maximums, buyer ceilings, competitor costs and seller-private price fields from provider input.
- `convex/lib/sellerValidation.ts` recomputes category/condition/profile eligibility, hard and soft fit, safe integer pricing and the documented minimum-price formula. It never consumes model-supplied totals or affordability.
- `convex/lib/sellerInventory.ts` contains plain transactional helpers for atomic reservations, execution locks, sale/release transitions, expiration and idempotent replay. The future buyer mutation must call these helpers inside its own transaction; they are not public Convex mutations.
- `convex/schema.ts`, `seller.ts` and `sellerInternal.ts` define seller-owned Convex tables, authenticated merchant operations, internal job preparation and job-bound proposal validation. The public surface derives merchant identity from authenticated membership and the canonical auth token identifier; IDs supplied by a browser are not authorization.
- `convex/sellerSeed.ts` provides an internal, revisioned fixture seed for all four profile families, P1–P6, accessories, C1/C2, H1/H2, A1/A2 and three synthetic merchants. It is empty-database-only and idempotent by seed revision; it does not make synthetic inventory or evidence look real.
- `convex/integrations/` contains a deterministic fixture port plus configuration-only Fetch.ai and CREAO HTTP adapters. They require HTTPS host allowlists, server-side token callbacks, idempotency keys, bounded timeouts, explicit provider run IDs and pending/poll/reconcile semantics. No live provider endpoint or credential is invented.
- v5.3 council envelopes are consumed from the buyer-owned canonical source (`frontend/src/contracts/index.ts` and generated `frontend/convex/lib/seller.schema.json`). The worker/parser/fixtures, Convex role-input/result records and buyer completion bridge use that source; do not add a second handwritten Python/TypeScript interpretation.
- `convex/sellerAgent.ts` now provides the server-only provider action path. It stores sanitized job input separately, claims a job before network I/O, persists provider run/model/status metadata, schedules bounded polling, preserves ambiguous starts for explicit reconciliation, best-effort cancels, and sends terminal output through deterministic seller validation. No provider payload or token is logged or persisted.
- `agents/fetch-seller/` now provides the actual Fetch seller runtime. Its fixed typed POST routes implement start, poll, reconcile and cancel; Agent Storage preserves idempotency across hosted invocations; a shared Agent Secret authenticates requests; and the pure seller logic performs bounded category/profile/condition/stock/requirement matching without seeing private pricing fields. The agent's public reference-price proposal remains non-authoritative and is revalidated by Convex.
- `scripts/test-seller.mjs` and `convex/tsconfig.json` provide dependency-light deterministic tests and a separate Convex typecheck. The seller schema and generated bindings are now pushed to the linked Convex development deployment and the revisioned fixture catalog has been seeded there. Production/Auth configuration and live provider sponsor evidence remain pending.
- The seller-owned v5.3 service authority is implemented without widening the legacy v1 provider contract: versioned policies persist an immutable `finalServiceOptions` allowlist, validate bounded public terms plus private nonnegative incremental bundle cost, resolve only server-authorized option IDs, and persist `serviceOptionId` on accepted offer versions. Canonical v2 provider results persist through the seller seam; the buyer still owns sealed invitation closure and public promotion.
- `convex/lib/sellerValidation.ts` exposes the seller-owned pure `validateFinalOfferRevision` seam. It accepts only the narrow final-candidate domain input and checks accepted-opening status, job/merchant/candidate/parent/policy scope, frozen listing identity and economics, brief fit, quantity and stock, non-increasing item prices, server floors/reference prices, allowlisted service terms, incremental contribution, delivered-total monotonicity and non-weakened terms. Thirty dependency-light seller tests cover accepted and rejected revisions; Convex v2 result persistence and the Fetch worker now use the canonical v2 envelope.
- `convex/lib/sellerOperator.ts` is the shared operator projection and listing-draft validation seam. `src/SellerOperator.tsx` renders a fixture-safe merchant control plane that exercises immutable listing versions, policy/service-option guardrails, merchant pause/resume and activity/readiness states without inventing a browser-side seller contract. It remains the primary short-demo path using pre-provisioned merchant data; live Auth wiring is optional and signup/onboarding is out of scope.

Generated Convex bindings remain generated output. Do not hand-write a second `_generated` API or duplicate the seller contracts in browser code.

## Contract and authority rules

1. `SellerBrief` is an allowlisted projection of the confirmed buyer brief plus a server-owned run/job ID. It excludes raw messages, origins and private budget. A v5.3 council input is a separate schema-versioned envelope; it is not a widened `SellerBrief`.
2. Every seller job is bound server-side to request/version, run, phase, merchant, candidate and input digest. A model-selected merchant ID is never authoritative.
3. Seller output is a proposal, scoped advocacy/reply, or hold/abstain/final-revision decision. The server recomputes product identity, policy version, stock, fit facts, delivered totals, contribution floors and service terms. Model text, comparisons and verdicts never override deterministic checks.
4. `OfferVersion` is immutable. Revisions point to a parent candidate/version; no in-place rewrite may change buyer-visible history.
5. Seller functions never approve, execute or settle a purchase. They expose validated offer data and transaction helpers to the buyer-owned lifecycle.
6. All browser-facing seller reads are authenticated and merchant-scoped. Internal functions are used for buyer/workflow calls and remain unavailable to the Convex client.
7. Network/model calls occur in actions or provider workers, never in Convex mutations. Stale, late, duplicated or mismatched completions are audited and ignored. A start timeout or no-response network failure without a provider reference becomes `ambiguous`; the system never blindly starts a second provider run and can reconcile by application job ID when configured.
8. The common v5.3 snapshot is the only permitted competitor projection. It is immutable, public-by-allowlist, capped at six candidates and contains no private affordability, costs, floors, raw prompt, private rationale or sealed final terms.
9. A seller may produce at most one outgoing challenge per merchant and one grouped reply for assigned incoming challenges. The seller worker cannot adjudicate, rank, remove a rival or open another debate.
10. Final revisions must reference the frozen candidate and basket. Price reductions are permitted; service improvements require a versioned `finalServiceOptions` policy grant, a typed `serviceOptionId` and private incremental cost/contribution validation. An old policy grants no service upgrade.

## Implementation phases and push gates

### S0: contract freeze and plan

- Add this plan and the seller sponsor-proof checklist.
- Add the exact seller/buyer boundary types and golden fixtures.
- Review the buyer-owned v5.3 canonical contracts at `origin/geoff/buyer` `df26d70` (v2 introduced at `d863b16`): request schemas stay version 1; council envelopes use version 2. Record the resolved schema revision and derive seller parsing/fixtures from it.
- Verify every new dependency against the seven-day package cooldown before installation.

### S1: deterministic seller core

- Implement pure category, listing, policy, pricing, fit and inventory rules.
- Add tests for floors/caps, integer cents, quantities, compatible lines, unknown hard facts, policy revisions, stock contention and idempotent transitions.
- No provider or buyer workflow dependency is allowed in this phase.

### S2: Convex seller backend

- Add the Convex schema and seller-scoped queries/mutations.
- Add internal proposal validation, immutable offer persistence and allocation helpers.
- Keep external calls out of mutations and keep private seller fields out of buyer projections.
- Validate the Convex source with the pinned compiler/package; deployment requires the team's Convex environment and is not faked locally.

### S3: agent provider seam

- Add one provider-neutral `AgentPort` with `start`, `poll` and best-effort `cancel`.
- Add deterministic fixture mode for CI and explicit Fetch.ai and CREAO adapters behind the same port.
- Validate all provider results against role-specific schemas, record provider run IDs/model/config revision, deduplicate repeated results and reconcile accepted-but-pending or ambiguous responses. The internal Convex action path is now implemented; live Fetch deployment/configuration is the next external handoff.
- The worker and Convex seam now support the published canonical v5.3 seller advocacy, grouped-reply and final-invitation roles alongside legacy opening jobs. Fixtures cover the frozen snapshot, one scoped challenge, grouped replies and parent-bound final decisions; keep buyer phase closure and sealed promotion outside this branch.
- Deploy `agents/fetch-seller/` as an Agentverse Hosted Agent, set the Agent Secret and exact Convex HTTPS allowlist, then record live run evidence. The repository's pure Python tests are dependency-free; any local uAgents install must use an exact vetted release that satisfies the seven-day cooldown.
- Do not claim Fetch.ai or CREAO prize eligibility until a real configured run is captured in the sponsor evidence ledger.

### S4: integration handoff

- Publish generated/type-checked contract usage for the buyer-side contributor.
- The seller-only fixture operator flow is implemented in `src/SellerOperator.tsx` and is the primary short-demo path with pre-provisioned merchant data. If live Convex data is useful, optionally wire it to the authenticated `seller.getMerchantView`, `updateOwnListing`, `publishOwnPolicy` and `pauseOwnMerchant` functions through a controlled development session; signup/onboarding is out of scope.
- Add integration tests that a buyer workflow can call without gaining merchant secrets, and prove merchant isolation, immutable versions and pause/resume behavior.
- Record exact live/fixture modes, limitations, run IDs and code paths in `docs/SELLER_SPONSOR_PROOF.md`.
- See `docs/SELLER_FETCH_CONFIGURATION.md` and `docs/BUYER_SELLER_INTEGRATION_NOTES.md` for the exact environment variables, internal action sequence and merge points.

## Sponsor eligibility plan for this branch

### Convex — target Best Use of Convex

Convex is a real seller backend: typed schema, reactive seller operator queries, transactional policy/listing writes and atomic inventory helpers. Proof must show merchant isolation, durable records, a reloadable seller view and a contention-safe reservation/allocation transition. A dependency alone is not proof.

### Fetch.ai — target Best Use of Fetch.ai

Fetch.ai must perform real seller work: opening matching plus at least one v5.3 seller advocacy, grouped-reply or final-invitation job produces a schema-valid result against the seller's own catalog/policy and the approved public snapshot, with provider provenance. The implementation will support fixture mode for deterministic tests, but the submission proof must show a real reachable Fetch agent, request/response, bounded tools and failure/retry behavior. The seller agent must not be presented as the moderator or adjudicator.

### CREAO — target CREAO AI tracks where eligible

The current architecture reserves CREAO for a distinct buyer-owned role such as intake, comparison/council or bounded evidence explanation. The seller branch keeps a provider-neutral seam and can support a seller/merchant-operations role only if the team intentionally chooses that distinct role, with configured agent/project identity, asynchronous run status, callback or polling deduplication, schema validation and visible safe events. Agent creation, a peripheral summary or code-generation use is not runtime proof. One-Person Company eligibility remains conditional on event rules and team eligibility.

### Factory Droid — deferred unless credentials and time support a real seller operation

The natural seller-side use is an operator-triggered listing/policy audit that produces a visible plan/diff and waits for approval before any change. It will not be claimed or added as a second autonomous council unless the actual Droid SDK is installed under the seven-day rule and the running product can show bounded access, steps, diff and result.

Visa, Coinbase/x402, Mana, Apify evidence and voice/design tracks remain outside the seller authority boundary unless the buyer/platform owner explicitly integrates them. Seller code must provide the facts and seams they need without claiming their prizes prematurely.

## Required acceptance and security evidence

- Merchant A cannot read, mutate or infer Merchant B's listings, policies, costs, floors, bids or jobs.
- A browser-supplied merchant ID, owner ID, role, record ID or provider run ID never grants access.
- Raw prompts, private maximums, requirement origins, arbitrary competitor information and sealed final terms never enter seller jobs or seller logs. The approved v5.3 public snapshot and checked outcome references are allowed only through the canonical role envelope and explicit field allowlist.
- The common snapshot is identical for all participants; changing only the buyer's private maximum cannot change seller input, comparative briefs or final invitations.
- Each merchant has at most one advocacy/challenge job and each challenged merchant has one grouped reply job; no reply-to-reply or repeated council is possible.
- A final decision is parent-bound, keeps goods/configuration/condition/quantity fixed, and cannot increase delivered total or weaken terms. Invalid or missing finals retain only a still-valid prior offer.
- Seller-facing council output is checked, bounded and non-authoritative; unsupported accusations cannot remove or down-rank a rival, and the seller cannot invent facts or sources.
- Invalid prices, quantities, variants, conditions, policy versions, stock transitions, replay keys and stale jobs fail closed.
- A policy-valid but over-budget offer may remain internal but is never made selectable by seller code.
- Late, duplicated, cancelled or mismatched provider results cannot reopen a job or alter a closed offer.
- Reservations and allocation transitions are atomic, idempotent and preserve sold/held inventory.
- `npm ci --ignore-scripts`, the seven-day dependency check, signature/audit checks, workflow checks, lint, typecheck, build and seller tests pass from a clean checkout.
- Sponsor proof states what is live, fixture, cached or simulated; no credentials or private provider payloads enter the repository.

## Open questions before live-provider proof

These do not block deterministic seller implementation but do block claiming live sponsor use:

- Which Fetch.ai transport/agent address and supported model will be used for the seller role?
- Which buyer-owned canonical v5.3 contract revision will the seller worker consume, and which generated fixtures/bindings will be regenerated from it?
- Which seller council phases are enabled in the first live proof: advocacy, grouped reply, final invitation, or all three?
- Which CREAO project/agent ID, run endpoint and callback/poll mechanism is enabled for the buyer-owned role?
- Which team-owned Convex production deployment and Auth environment will host the schema and functions?
- Does the team want the Factory Droid seller audit in this branch, or should it remain a documented stretch target?

Until those are answered with credentials supplied through the appropriate secret mechanism, keep provider mode as `fixture`; the linked development deployment is only a smoke-test environment.
