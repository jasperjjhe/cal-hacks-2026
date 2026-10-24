# BuyerUnion seller-side implementation plan

Status: active working plan for `feature/seller-side`, branched from `dev` on October 24, 2026.

## Source of truth

The active implementation contract is `BUYERUNION_IMPLEMENTATION.md`, especially sections 3, 5, 6, 7, 8, 11, 12, 15, 16, 17, 19 and 20. The PDF product brief and the v4 Markdown conversion were read before this plan was created. `buyerunion-prd-v4-source.md` is an archive of historical decisions; it is not an alternate active implementation plan.

The seller-side implementation must preserve the buyer-side ownership described by the active handoff. A future buyer-side contributor will integrate through versioned contracts and Convex internal functions; this branch must not create a second workflow, buyer request store, evidence store, checkout authority or competing source of truth.

## Seller-side scope

This branch owns:

- merchant membership and seller authorization boundaries;
- category profiles, products, variants and provenance-aware catalog data;
- immutable listing versions and seller pricing/service policies;
- deterministic requirement eligibility, fit facts, delivered-price validation and seller-safe rejection reasons;
- seller proposal validation and immutable offer versions;
- inventory availability, reservations and allocation transitions used transactionally by the buyer lifecycle;
- seller job input/output contracts and provider-neutral Fetch.ai/CREAO adapters;
- a seller operator view/query surface that exposes only the operator's own merchant data;
- fixtures, tests and evidence artifacts proving the above behavior.

The later buyer-side branch owns requests, raw buyer messages, private maximums, confirmation, run/workflow stage, council coordination, evidence acquisition, comparison projection, quote approval and execution. Seller code receives a sanitized `SellerBrief`; it never receives the raw prompt, requirement provenance or private maximum.

## Planned repository layout

```text
frontend/
  convex/
    schema.ts                 # seller tables plus future buyer tables in one schema
    seller.ts                 # public operator queries/mutations only
    sellerInternal.ts         # buyer/workflow integration seam; never browser-callable
    sellerJobs.ts              # job-bound proposal validation and completion transitions
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
docs/
  SELLER_IMPLEMENTATION_PLAN.md
  SELLER_SPONSOR_PROOF.md
```

## Implemented checkpoint

The first seller-only checkpoint is now implemented on `feature/seller-side`:

- `convex/lib/sellerContracts.ts` is the canonical seller contract/runtime boundary. It allowlists `SellerBrief`, rejects unknown fields, and rejects raw prompts, origins, private maximums, buyer ceilings, competitor costs and seller-private price fields from provider input.
- `convex/lib/sellerValidation.ts` recomputes category/condition/profile eligibility, hard and soft fit, safe integer pricing and the documented minimum-price formula. It never consumes model-supplied totals or affordability.
- `convex/lib/sellerInventory.ts` contains plain transactional helpers for atomic reservations, execution locks, sale/release transitions, expiration and idempotent replay. The future buyer mutation must call these helpers inside its own transaction; they are not public Convex mutations.
- `convex/schema.ts`, `seller.ts` and `sellerInternal.ts` define seller-owned Convex tables, authenticated merchant operations, internal job preparation and job-bound proposal validation. The public surface derives merchant identity from authenticated membership; IDs supplied by a browser are not authorization.
- `convex/integrations/` contains a deterministic fixture port plus configuration-only Fetch.ai and CREAO HTTP adapters. They require HTTPS host allowlists, server-side token callbacks, idempotency keys, bounded timeouts, explicit provider run IDs and pending/poll/reconcile semantics. No live provider endpoint or credential is invented.
- `scripts/test-seller.mjs` and `convex/tsconfig.json` provide dependency-light deterministic tests and a separate Convex typecheck. These prove local behavior only; live Convex/provider sponsor evidence remains pending until deployment/provider configuration is supplied.

Generated Convex bindings remain generated output. Do not hand-write a second `_generated` API or duplicate the seller contracts in browser code.

## Contract and authority rules

1. `SellerBrief` is an allowlisted projection of the confirmed buyer brief plus a server-owned run/job ID. It excludes raw messages, origins and private budget.
2. Every seller job is bound server-side to request/version, run, phase, merchant, candidate and input digest. A model-selected merchant ID is never authoritative.
3. Seller output is a proposal or hold/abstain decision. The server recomputes product identity, policy version, stock, fit facts, delivered totals, contribution floors and service terms.
4. `OfferVersion` is immutable. Revisions point to a parent candidate/version; no in-place rewrite may change buyer-visible history.
5. Seller functions never approve, execute or settle a purchase. They expose validated offer data and transaction helpers to the buyer-owned lifecycle.
6. All browser-facing seller reads are authenticated and merchant-scoped. Internal functions are used for buyer/workflow calls and remain unavailable to the Convex client.
7. Network/model calls occur in actions or provider workers, never in Convex mutations. Stale, late, duplicated or mismatched completions are audited and ignored.

## Implementation phases and push gates

### S0: contract freeze and plan

- Add this plan and the seller sponsor-proof checklist.
- Add the exact seller/buyer boundary types and golden fixtures.
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
- Validate all provider results against role-specific schemas, record provider run IDs/model/build/config revision, deduplicate callbacks and reconcile accepted-but-pending responses.
- Do not claim Fetch.ai or CREAO prize eligibility until a real configured run is captured in the sponsor evidence ledger.

### S4: integration handoff

- Publish generated/type-checked contract usage for the buyer-side contributor.
- Add a seller-only demo/operator flow and integration tests that a buyer workflow can call without gaining merchant secrets.
- Record exact live/fixture modes, limitations, run IDs and code paths in `docs/SELLER_SPONSOR_PROOF.md`.

## Sponsor eligibility plan for this branch

### Convex — target Best Use of Convex

Convex is a real seller backend: typed schema, reactive seller operator queries, transactional policy/listing writes and atomic inventory helpers. Proof must show merchant isolation, durable records, a reloadable seller view and a contention-safe reservation/allocation transition. A dependency alone is not proof.

### Fetch.ai — target Best Use of Fetch.ai

Fetch.ai must perform real seller work: a scoped seller job produces a schema-valid proposal against the seller's own catalog/policy and returns provider provenance. The implementation will support fixture mode for deterministic tests, but the submission proof must show a real reachable Fetch agent, request/response, bounded tools and failure/retry behavior.

### CREAO — target CREAO AI tracks where eligible

CREAO must perform a real seller or merchant-operations role through the same `AgentPort`, with configured agent/project identity, asynchronous run status, callback or polling deduplication, schema validation and visible safe events. Agent creation, a peripheral summary or code-generation use is not runtime proof. One-Person Company eligibility remains conditional on event rules and team eligibility.

### Factory Droid — deferred unless credentials and time support a real seller operation

The natural seller-side use is an operator-triggered listing/policy audit that produces a visible plan/diff and waits for approval before any change. It will not be claimed or added as a second autonomous council unless the actual Droid SDK is installed under the seven-day rule and the running product can show bounded access, steps, diff and result.

Visa, Coinbase/x402, Mana, Apify evidence and voice/design tracks remain outside the seller authority boundary unless the buyer/platform owner explicitly integrates them. Seller code must provide the facts and seams they need without claiming their prizes prematurely.

## Required acceptance and security evidence

- Merchant A cannot read, mutate or infer Merchant B's listings, policies, costs, floors, bids or jobs.
- A browser-supplied merchant ID, owner ID, role, record ID or provider run ID never grants access.
- Raw prompts, private maximums, requirement origins and competitor information never enter seller jobs or seller logs.
- Invalid prices, quantities, variants, conditions, policy versions, stock transitions, replay keys and stale jobs fail closed.
- A policy-valid but over-budget offer may remain internal but is never made selectable by seller code.
- Late, duplicated, cancelled or mismatched provider results cannot reopen a job or alter a closed offer.
- Reservations and allocation transitions are atomic, idempotent and preserve sold/held inventory.
- `npm ci --ignore-scripts`, the seven-day dependency check, signature/audit checks, workflow checks, lint, typecheck, build and seller tests pass from a clean checkout.
- Sponsor proof states what is live, fixture, cached or simulated; no credentials or private provider payloads enter the repository.

## Open questions before live-provider proof

These do not block deterministic seller implementation but do block claiming live sponsor use:

- Which Fetch.ai transport/agent address and supported model will be used for the seller role?
- Which CREAO project/agent ID, run endpoint and callback/poll mechanism is enabled for the seller role?
- Which Convex deployment/team environment will host the schema and functions?
- Does the team want the Factory Droid seller audit in this branch, or should it remain a documented stretch target?

Until those are answered with credentials supplied through the appropriate secret mechanism, use fixtures and mark provider mode as `fixture`.
