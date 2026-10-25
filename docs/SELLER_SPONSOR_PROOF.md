# Seller-side sponsor proof ledger

This file is a submission artifact ledger. Code paths and deterministic tests document implementation, but a prize is claimed only after the `Live run or URL` and provider/deployment evidence columns are filled with a judge-reproducible run.

| Track | Seller feature | Exact code/config path | Live run or URL | Mode | What judges can see | Limitation / pending verification |
|---|---|---|---|---|---|---|
| Convex | Seller schema, revisioned fixture seed, authenticated operator view, immutable listing/policy versions, job-bound proposal persistence, provider job state and pure atomic allocation helpers | `frontend/convex/schema.ts`, `frontend/convex/sellerSeed.ts`, `frontend/convex/seller.ts`, `frontend/convex/sellerInternal.ts`, `frontend/convex/sellerAgent.ts`, `frontend/convex/lib/sellerInventory.ts` | Development deployment linked locally; submission URL TBD | development deployment + fixture; production/Auth proof pending | Merchant-scoped reactive view; server-owned policy/listing versions; no cross-merchant access; contention-safe reservation helpers; visible provider status | The development deployment is real smoke-test evidence, but Auth, production deployment, judge-reproducible URL and buyer-owned transaction proof still need configuration |
| Fetch.ai | Scoped seller agent proposal through the provider-neutral HTTP port and Convex provider action | `frontend/convex/sellerAgent.ts`, `frontend/convex/integrations/fetchAdapter.ts`, `frontend/convex/integrations/httpAgentPort.ts`, `docs/SELLER_FETCH_CONFIGURATION.md` | TBD | action path implemented; live endpoint pending | HTTPS allowlist, server-side token callback, idempotent start, pending/poll/reconcile, ambiguous-start recovery, schema validation handoff | Exact agent address, transport, model and run endpoints are intentionally configuration-only; no Fetch prize claim until a real run is recorded |
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

The repository is now linked to a Convex development deployment. `npx convex dev` from `frontend/` pushes the schema/functions and regenerates the checked-in `convex/_generated/` bindings. The deployment URL remains in ignored `.env.local`. Never add `.env.local`, deploy keys, provider tokens or raw run payloads to the repository. Production deployment, Auth configuration and a judge-reproducible sponsor run remain separate handoff steps; the development deployment is not being represented as production proof.
