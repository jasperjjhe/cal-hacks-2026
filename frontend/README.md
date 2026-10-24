# BuyerUnion buyer workspace

The default React application uses an authenticated Convex backend. Requests,
immutable confirmed versions, agent jobs, durable runs, evidence, quotes, stock
allocations, approvals, execution attempts, bookmarks and orders are persisted.
The historical browser-only prototype is available explicitly at `/mock`.

## Local setup

Use Node 24 (`.nvmrc`) and the reviewed lockfile. From `frontend/`:

```sh
npm run security:dependencies
npm ci --ignore-scripts
npx convex dev --typecheck enable
```

Keep that terminal running. On a fresh checkout, select local development / use
without an account if prompted. The CLI generates `.env.local` and downloads the
local backend. A cloud deployment or provider key is not required. Unlike a cloud
deployment, the local backend stops when its development process stops; `--once`
is for deployment/checking, not for keeping the application online.

In a second terminal, initialize the new local deployment once:

```sh
node scripts/setup-local-auth.mjs
npx convex run sellerSeed:seedSellerDemo '{"seedRevision":"buyer-v1"}'
npm run dev
```

Open `http://localhost:5173`. Restart Vite if it was running before `.env.local`
was generated. Authentication keys and the local database are ignored by Git.
Do not rerun the auth initializer on every startup: it rotates signing keys.
For a local catalog seeded before the diagnostic fix, run
`npx convex run buyerAdmin:upgradeDemoDiagnostics '{}'` once. This creates new
listing versions and preserves allocations and historical order snapshots.

Seeding is idempotent for the same revision and refuses to reset a nonempty
catalog with another revision. Existing purchases are never silently reset.

A buyer session signs in anonymously. Keep the same browser profile to return to
its requests; cross-device recovery is outside this prototype. A request URL
contains only the request ID; ownership is checked by the server on every call.

## Working journey

1. Describe a laptop, clothing item, household accessory or small appliance.
   Fixture intake proposes explicit supported details; it is not live language
   interpretation. ISO dates such as `2026-11-15` are recognized. All missing or
   unrecognized requirements can be entered in the editable brief.
2. Review the primary item, up to two related items, quantities 1–10, conditions,
   measurable hard requirements/weighted preferences, deadline and private
   maximum delivered total. An optional shared target requires separate consent.
3. Confirm and start. The backend coordinates actual persisted demo merchant
   jobs, validates them through seller rules, runs at most one sealed price round
   when useful, and checks evidence applicability. Missing real evidence is shown
   honestly. These fixtures use synthetic product identities and diagnostics.
4. Sort, compare, inspect sources/facts and save checked offers. Select one for a
   freshly validated three-minute firm quote and atomic stock hold.
5. Review exact product configuration, quantities, total and terms. Explicitly
   approve the simulation. Duplicate approvals share one execution/order. A
   decline releases stock; an unknown result retains it and reconciles the same
   attempt. Success says **“Demo order completed; no payment taken.”**
6. Reload or visit Orders to see persisted progress and the frozen receipt.

Revising a brief invalidates its old run, releases unapproved holds and resets
shared-target consent. Pending/unknown purchases block edits and new execution.
Seven-day cleanup removes reconciled request/research data, retaining unresolved
executions and stock ledger entries so deletion cannot restock sold goods.

## Provider configuration — last integration step

`convex/integrations/buyerTools.ts` contains the fill-in functions for CREAO,
Apify and supported external payment lookup. They intentionally do not contain
guessed endpoints or credentials. Fixture agent mode and simulated checkout work
without them. See [the handoff](../docs/BUYER_BACKEND_HANDOFF.md) before enabling
live mode. The Connections screen states the actual current modes.

Operator accounts are provisioned only through the internal
`buyerAdmin:provisionOperator` action. Public password signup is disabled;
membership is assigned server-side to one merchant. After password sign-in,
call `seller.bindOperatorSession({})` before querying the seller workspace.
It derives the merchant from an internal account grant and binds the exact
`identity.tokenIdentifier`, following Dev S's authentication contract. Repeat
this call after each new login; it is idempotent. Clients cannot choose a
merchant or role. Use separate buyer/operator browser contexts. The buyer UI
does not expose seller administration.

For an existing deployment with the old `authSubject` membership field, deploy
the transitional schema and run `npx convex run buyerAdmin:migrateOperatorMemberships '{}'`
once. It is safe to repeat. Legacy subjects never authorize seller operations;
existing token-identifier memberships remain valid. See the review-resolution
handoff for details before merging Dev S's schema.

## Checks

```sh
npm run contracts:check
npm run test:buyer
npm run test:seller
npm run test:backend
npm run typecheck:backend
npm run lint
npm run build
```

`test:backend` runs real Convex function handlers and Workflow components against
`convex-test`'s isolated database/runtime. It checks ownership, privacy, versioning,
sealed promotion, category/basket behavior, contention, rollback, quote expiry,
exact approval, duplicate execution, decline/unknown status, evidence provenance
and seven-day retention. It does not prove external provider behavior.

`npm run ci` additionally installs from the lockfile with scripts disabled and
checks dependency age, signatures, workflow policy and vulnerabilities. CI runs
backend and seller checks as well as the original browser-mock regression tests.

## Design reference

[Figma](https://www.figma.com/design/anisZ6onqrgSdZMnzbjBuf), home `53:1134`,
provides layout/colors. Rechecked during backend UI work on October 24. The navy
sidebar, centered prompt and illustrated offer cards use existing design tokens
and downloaded local images. Photos illustrate laptops; exact facts come from
the selected variant. Responsiveness and interactions follow implementation
judgment. Figma placeholder identities, ratings and provider claims are not data.
