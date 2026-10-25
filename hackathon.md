# Hackathon log

- **Project:** Converge
- **Event:** Cal Hacks 13.0
- **What it does:** A buyer confirms a shopping brief, merchant agents compete in a moderated council with sealed final offers, and the buyer compares checked evidence and approves an exact test-mode order.
- **Live app:** not deployed
- **Repo:** https://github.com/jasperjjhe/cal-hacks-2026 (app code on the `dev` branch)
- **Frontend:** not deployed
- **Convex deployment:** https://little-dove-539.ca-central-1.convex.cloud (dev deployment, in `docs/LOCAL_CONTEXT.md`)
- **Components:** `@convex-dev/workflow`
- **Convex features:** schema (39 tables, 72 indexes), queries, mutations, actions, HTTP router (Convex Auth routes), crons, scheduled functions, realtime `useQuery`
- **Auth:** Convex Auth (Anonymous, Password)
- **AI models:** none in code; CREAO agents take their model id from deployment config
- **Started:** 2026-10-24T04:04:29Z
- **Last updated:** 2026-10-25T15:21:55Z

## How we use Convex

Paths are under `frontend/` on `dev`.

- **Sign-in and guest sessions:** Convex Auth with Anonymous and Password providers, routes in `convex/http.ts`. Proof: `convex/auth.ts`.
- **Shopping runs that survive restarts:** intake, bids, council rounds, sealed finals and evidence run as a durable workflow via the `@convex-dev/workflow` component (`convex/convex.config.ts`, `convex/buyerWorkflow.ts`) plus `ctx.scheduler` jobs (`convex/buyerJobs.ts`).
- **Merchant agents, server-checked offers:** internal actions dispatch Fetch.ai and CREAO jobs (`convex/sellerAgent.ts`); offers are accepted only after `convex/lib/sellerValidation.ts` recomputes them.
- **Owner-scoped data:** requests, offers, quotes and orders in indexed tables like `by_owner` (`convex/buyer/schema.ts`).
- **Recoverable test checkout:** Stripe test checkout (`convex/buyer/checkout.ts`); `convex/crons.ts` retries stalled executions every minute and runs retention every 6 hours.
- **Live without refresh:** home (recent requests, saved and suggested offers), run progress and offers, evidence, checkout status and orders, via `useQuery` in `src/converge/ConvergeApp.tsx` and `src/converge/Pages.tsx`.

## Log

UTC, 2026. SHAs from `dev`.

- 10-24 04:04Z `be62a7b` Market research report: report (.md)
- 10-24 04:51Z `a6c64c2` PRD: PRD (.pdf)
- 10-24 05:25Z `42cca03` Technical spec: spec (.pdf)
- 10-24 06:46Z `9fc0440` Product brief: brief (.pdf)
- 10-24 18:58Z `cf11006` Frontend scaffold: `frontend/src`
- 10-24 19:48Z `3ba1de3` Backend handoff, PRD archive: spec (.md)
- 10-24 20:24Z `654a26f` Supply-chain hardening: `.github/workflows`, `security/`
- 10-25 03:52Z `b7af20d` Council v5.3 spec: spec, `README.md`
- 10-25 07:30Z `6c196af` Convex backend, Auth, Workflow (#8): `schema.ts`, `buyerWorkflow.ts`, `auth.ts`
- 10-25 07:34Z `59f7de4` Seller v2 Fetch workflow: `sellerAgent.ts`, `agents/fetch-seller`
- 10-25 08:23Z `3bed087` Reddit evidence (#10): `redditBuyer.ts`, `buyerEvidence.ts`
- 10-25 08:58Z `479168a` Accounts, Stripe test checkout (#11): `buyer/checkout.ts`
- 10-25 09:02Z `279ac1d` Rename to Converge (#12): `frontend/src`, `agents/`
- 10-25 10:43Z `4b5c071` Headphone demo (#14): `sellerFixtures.ts`, `highlights.ts`
- 10-25 10:45Z `b3035ab` Buyer UI from Figma (#16): `src/converge/`
- 10-25 10:47Z `9ae46be` Seller UI (#13): `src/seller/`
- 10-25 11:16Z `e96c075` Live Fetch agent, gateway (#15): `agent.py`, `gateway.py`
- 10-25 11:26Z `d55edc3` Suggested offers (#18): `Home.tsx`, `converge.css`
- 10-25 12:02Z `a2f6c7f` Seller final pricing (#17): `sellerValidation.ts`, `seller_logic.py`
- 10-25 12:07Z `cfa5818` Naming guard (#19): `naming.test.mjs`
