# Seller-side sponsor proof ledger

This file is a submission artifact ledger. Code paths and deterministic tests document implementation, but a prize is claimed only after the `Live run or URL` and provider/deployment evidence columns are filled with a judge-reproducible run.

| Track | Seller feature | Exact code/config path | Live run or URL | Mode | What judges can see | Limitation / pending verification |
|---|---|---|---|---|---|---|
| Convex | Seller schema, revisioned fixture seed, authenticated operator view, immutable listing/policy versions, job-bound proposal persistence, and pure atomic allocation helpers | `frontend/convex/schema.ts`, `frontend/convex/sellerSeed.ts`, `frontend/convex/seller.ts`, `frontend/convex/sellerInternal.ts`, `frontend/convex/lib/sellerInventory.ts` | TBD | local typecheck + fixture; live pending | Merchant-scoped reactive view; server-owned policy/listing versions; no cross-merchant access; contention-safe reservation helpers | Convex deployment, generated bindings and Auth environment still need team configuration; local fixture is not deployment proof |
| Fetch.ai | Scoped seller agent proposal through the provider-neutral HTTP port | `frontend/convex/integrations/fetchAdapter.ts`, `frontend/convex/integrations/httpAgentPort.ts` | TBD | fixture adapter; live pending | HTTPS allowlist, server-side token callback, idempotent start, pending/poll/reconcile, schema validation handoff | Exact agent address, transport, model and run endpoints are intentionally configuration-only; no Fetch prize claim yet |
| CREAO | Async seller/merchant-operations role through the same provider-neutral port | `frontend/convex/integrations/creaoAdapter.ts`, `frontend/convex/integrations/httpAgentPort.ts` | TBD | fixture adapter; live pending | Explicit run IDs, accepted-as-pending behavior, polling, cancellation and safe completion boundary | Project/agent ID, run endpoint and callback/poll setup are intentionally unresolved; no CREAO prize claim yet |
| Factory | Approved listing/policy audit with plan/diff | TBD | TBD | not implemented | Only claim if Droid performs real work in the running product | Deferred pending SDK/runtime decision |

## Evidence rules

- A package, API key, logo, generated code or slide is not runtime proof.
- Record exact feature, commit, run ID, mode, inputs, outputs, failure behavior and known limitation.
- Never commit credentials, wallet seeds, private provider payloads or raw buyer/merchant secrets.
- Fixture runs prove deterministic behavior only; they do not prove Fetch.ai, CREAO, Convex deployment or Factory eligibility.

## Current local evidence

- `npm run test:seller` covers the budget-redacted SellerBrief, deterministic policy/fit/price checks, P6/C2/H2/A2 negative fixtures, malformed provider output boundaries, pending fixture completion, HTTPS provider allowlists and last-unit contention.
- `npm run typecheck:seller` typechecks the schema, public/internal Convex functions, contracts, inventory helpers and provider adapters without a deployment or credential.
- `npm audit signatures --json`, `npm audit --audit-level=high`, `npm ci --ignore-scripts` and the seven-day package-age check pass for the current locked tree. The exact Convex transitive `esbuild@0.27.0` lifecycle entry is reviewed in `security/allowed-install-scripts.json`; its script remains disabled.
- The first live provider run must append: provider identity/config revision, non-secret run ID, input/output digests, pending-to-terminal transition, one schema-valid proposal, one malformed/timeout recovery, and the exact mode (`live`, `fixture`, `cached`, `simulation`, or `visa_sandbox`).

## Deployment handoff

The Convex CLI will generate `convex/_generated/` only after the team configures a real Convex deployment. Run `npx convex dev` from `frontend/` with credentials supplied through the private environment mechanism, review the generated diff, and commit generated bindings if the team’s deployment workflow requires them. Never add `.env.local`, deploy keys, provider tokens or raw run payloads to the repository. Until that handoff is complete, the generic Convex function builders and `typecheck:seller` are intentionally the local validation seam; this is not a claim that the backend is deployed.
