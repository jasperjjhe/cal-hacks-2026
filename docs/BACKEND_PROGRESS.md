> Council format update (October 24, 2026): [spec v5.3](../BUYERUNION_IMPLEMENTATION.md)
> and [seller council handoff](SELLER_COUNCIL_HANDOFF.md) supersede older council
> descriptions. Public snapshot → merchant defense/challenge → grouped reply →
> checked outcomes → sealed finals is specified, **not implemented**. Earlier
> test/review results below describe the previous workflow, not v5.3 acceptance.

# Buyer backend implementation progress

The user confirmed that the contracts are frozen and requested the complete buyer backend, with external tool integrations filled in last. Convex deployment being deferred is not a blocker to local implementation.

## Checkpoint 1

- Reviewed buyer interface and regression fixes.
- Convex 1.47.0, Convex Auth and durable Workflow installed under the seven-day policy.
- Real anonymous local Convex deployment successfully started and schema/functions deployed without a cloud account.
- Auth skeleton (anonymous buyers; public operator signup disabled), unified seller/buyer schema, and transactional inventory bridge.
- Reused seller source from `origin/feature/seller-side` commit `37d7ea5`; no seller branch was changed or merged.
- Buyer lifecycle/workflow/checkout handlers and backend-driven UI are being implemented in subsequent checkpoints. This checkpoint is not feature completion.

Validation: dependency policy, signatures, audit, existing 24 buyer tests, four security tests, lint/build and 13 seller tests passed. Local Convex deployment/typecheck passed before the next handler work began.

No credentials or local database files belong in Git. New esbuild metadata allowance was reviewed; installation scripts remain disabled.

## Checkpoint 2 — persisted buyer journey

The default application now uses authenticated Convex queries/actions, durable
Workflow orchestration, S's deterministic proposal and inventory helpers, a
sealed final-price round, evidence acquisition guards, firm quotes, atomic stock
holds, exact approval, idempotent execution and persisted orders. `/mock` retains
the explicitly offline prototype; it is no longer the main application.

Verified: local Convex deployment/typecheck, production build, lint, 24 existing
buyer checks and nine Convex function integration tests. The real local browser
flow reached checked offers and explicit simulation approval. Final acceptance,
retention, retry/revalidation coverage and integration instructions continue in
the next checkpoint. External provider adapters intentionally remain unconfigured.

## Final buyer implementation and audit

All work is on `geoff/buyer`. Both local and remote `dev` were restored to the
original `609e53e`; the original implementation commits and unfinished work were
preserved on this branch before continuing.

Implemented the buyer lifecycle, private/consented seller projections, profile
validation and shared unit conversion, role-scoped durable jobs, bounded retries,
sealed final-price staging/promotion, source applicability/cache/reassessment,
comparison and bookmarks, exact firm quote approval, atomic allocations,
idempotent simulated execution/reconciliation, frozen receipts, internal operator
provisioning and seven-day retention. The default UI uses these backend APIs;
`/mock` is only the explicitly offline historical prototype.

Final audit fixes include canonical request-only run reads and cursor pagination,
clearing old unapproved holds on refresh, blocking changes to completed purchases,
shared scoring across initial offers and evidence reassessment, no private buyer
flags in final seller inputs, unit diagnostics taking precedence over generic
product facts, and an idempotent diagnostic upgrade that preserves stock and
approved snapshots. Mobile navigation, quote consent reset, exact configuration
inspection, modal comparison and Vite refresh behavior were also checked/fixed.

Verification: 20 backend integration tests, 13 seller tests, 24 buyer regression
checks and 4 dependency-policy tests (61 total); contract export, backend
typecheck, lint and production build. Full CI dependency installation/signatures,
zero-vulnerability audit, seven-day dependency age and workflow rules passed;
relevant tests/typecheck/lint/build were rerun after the final changes. Real local
Convex deployment/typecheck passed, and the browser completed a persisted
simulated order with reload recovery. Desktop/mobile checks include loaded local
laptop illustrations, visible navigation and no horizontal page overflow.

Remaining configuration is explicit: fill the verified CREAO/Apify/payment
adapters in `frontend/convex/integrations/buyerTools.ts`, add genuine exact product
identities/sources before claiming live evidence, and configure deployment when
the team is ready. External providers and a public deployment are not claimed as
verified. See `BUYER_BACKEND_HANDOFF.md` and `frontend/README.md` for setup and the
seller-branch integration changes.
