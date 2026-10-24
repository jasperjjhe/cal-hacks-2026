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
