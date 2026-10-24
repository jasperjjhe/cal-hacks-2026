# Seller-side sponsor proof ledger

This file is a submission artifact template, not proof by itself. Fill one row only after the running product demonstrates the feature.

| Track | Seller feature | Exact code/config path | Live run or URL | Mode | What judges can see | Limitation / pending verification |
|---|---|---|---|---|---|---|
| Convex | Seller catalog/policy and atomic allocation helpers | `frontend/convex/` | TBD | fixture/live | Merchant-scoped reactive view; policy validation; reservation contention | Convex deployment and Auth environment pending |
| Fetch.ai | Scoped seller agent proposal | `frontend/convex/integrations/fetchAdapter.ts` | TBD | fixture/live | SellerBrief in, schema-valid proposal and provider provenance out | Agent address, transport and model pending |
| CREAO | Async seller/merchant-operations role | `frontend/convex/integrations/creaoAdapter.ts` | TBD | fixture/live | Agent/project identity, run status, safe events and deduplicated completion | Project/agent ID and callback/poll setup pending |
| Factory | Approved listing/policy audit with plan/diff | TBD | TBD | not implemented | Only claim if Droid performs real work in the running product | Deferred pending SDK/runtime decision |

## Evidence rules

- A package, API key, logo, generated code or slide is not runtime proof.
- Record exact feature, commit, run ID, mode, inputs, outputs, failure behavior and known limitation.
- Never commit credentials, wallet seeds, private provider payloads or raw buyer/merchant secrets.
- Fixture runs prove deterministic behavior only; they do not prove Fetch.ai, CREAO, Convex deployment or Factory eligibility.
