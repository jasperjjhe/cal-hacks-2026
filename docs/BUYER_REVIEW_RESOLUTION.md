> Council format update (October 24, 2026): [spec v5.3](../CONVERGE_IMPLEMENTATION.md)
> and [seller council handoff](SELLER_COUNCIL_HANDOFF.md) supersede older council
> descriptions. Public snapshot → merchant defense/challenge → grouped reply →
> checked outcomes → sealed finals is specified, **not implemented**. Earlier
> test/review results below describe the previous workflow, not v5.3 acceptance.

# Buyer branch review resolution

The final review of `geoff/buyer` at `ff0f4d4` found 17 actionable defects.
They are addressed on this branch. The first fixes were pushed in `ae31883`;
subsequent regression and handoff changes follow that commit.

## Findings and regression coverage

| Finding | Resolution | Verification |
| --- | --- | --- |
| Interrupted execution remains pending indefinitely | Approval and claims atomically schedule a 60-second recovery timer. Recovery marks the same execution unknown and reconciles it; it never repeats the payment operation. A minute cron also recovers older pending attempts lacking a timer. | Claimed-but-interrupted recovery, unclaimed approval recovery, same execution/order identity. |
| Purchase guard ignores attempts after the first 30 | Filter for succeeded/pending/unknown before limiting the query. Retention independently checks unresolved attempts before any history cap. | Thirty declined attempts followed by an unresolved attempt block another reservation. |
| Seller listing publication inserts system fields | Strip database metadata, reject stale listing versions, disable the preceding version and insert the new version atomically. | Authenticated price update succeeds; replaying the old version fails; exactly one version remains enabled. |
| Related basket lines cannot share a listing | Preserve line-specific allocations while checking aggregate demand per listing. Duplicate request-line IDs remain rejected. | A real three-line laptop/two-mouse workflow reserves two units; aggregate overcapacity and changed-key replay checks fail safely. |
| Moderator repair loses its validated output | Copy successful child output and digest to the parent job. | Repaired moderator plan parses and is consumed by council preparation. |
| Second-candidate challenges disappear | Match challenged offer identity before deduplicating merchants. | A second candidate is selected and receives the response job. |
| Final bids use a later worker deadline | Pin preparation to the round deadline and validate round ownership, status, participants and deadline at completion and promotion. | Delayed preparation, expired dispatch and a worker record with a later deadline cannot submit a late bid. |
| Paused merchants create false competition | Re-evaluate merchant and policy eligibility at round creation, phase preparation and provider dispatch. | One active merchant without a shared target cannot open competition; pausing a prepared merchant cancels its undispatched job. |
| Conflicting authoritative facts overwrite each other | Detect conflicting values for each exact-product field and block requirement eligibility/selection. Array-valued facts compare without depending on element order. | Conflicting manufacturer OS facts block the offer in either result order. |
| Frozen buyer/seller contracts disagree | Seller wire types and runtime parsing derive from `src/contracts/index.ts`; both JSON Schema files are generated and checked from that source. | Canonical 100-requirement/100-claim/40-source limits, 4,000-character text and rejection beyond limits; generated worker schema check runs in seller CI. |
| Primary item assumes input order | Normalize confirmed lines and independently order projected products by primary role. | Accessory-first confirmation produces a laptop-first card and primary-only research identities. |
| Ambiguous provider start launches duplicate work | Transport exceptions leave the same job pending. Polling uses the original job ID even when no provider run ID was received. | A mocked accepted-then-timeout start runs once, polls the same ID and creates no repair job. |
| Rejected repaired bids report no supply | A second deterministic rejection marks the job failed, propagates failure through the repair parent and produces a retryable run failure. | Invalid repaired bids across merchants produce failed, not no_match. |
| Scalar `in` requirement gets confirmed | Validate collection operators before scalar field types and reject empty/malformed collections. | Scalar membership predicate is rejected before request confirmation. |
| Excerpts misrepresented as independent sources | Label the displayed count as evidence excerpts. | Source inspection and production build. |
| Comparison IDs outlive their run | Key comparison picks by server run ID and suppress an obsolete comparison dialog. | A subscribed run replacement clears three stale picks and admits a new selection. |
| Saved evidence uses the current request | Save originating request/run IDs and query that run with ownership checks. Old snapshots without context explicitly disclose unavailable archived evidence. | Archived source remains readable after refreshing the request; another owner cannot read it. |

## Authentication decision: Dev S's token identifier

Seller authorization uses the exact `identity.tokenIdentifier` and
`memberships.by_authTokenIdentifier`, matching Dev S's current contract.
It does not match a subject prefix or accept a caller-selected merchant.

Convex Auth includes a session ID in its subject, so the exact identifier changes
on a new login. `buyerAdmin.provisionOperator` internally creates the password
account and a stable `operatorAccounts` grant. After each password login, the
seller frontend must call:

```ts
await bindOperatorSession({}) // api.seller.bindOperatorSession
```

This authenticated mutation derives the user and merchant from server-owned
identity/account records and binds the current token identifier. It is idempotent
and rejects unprovisioned or ambiguous accounts. It accepts no merchant, role or
identity parameters. Public signup remains disabled. `requireSellerMembership`
then performs the exact-token membership lookup used by Dev S.

For older deployments, the transitional schema accepts legacy `authSubject`
solely so its data can be migrated; that field never authorizes an operation.
After deploying this code, run:

```sh
npx convex run buyerAdmin:migrateOperatorMemberships '{}'
```

It converts old demo identities to exact-token fixtures and old operator user
IDs to internal account grants. Existing Dev S token-identifier records are left
unchanged. The migration is idempotent and does not reset catalog or purchases.
The existing local deployment migrated three demo rows successfully.

## Dev S integration

The latest fetched seller branch remains `origin/feature/seller-side` at
`853f08b` (configure Convex development deployment). Do not merge that unfinished
branch automatically: the agreed workflow is to combine branches together later.

The earlier merge calculation identified 17 conflicted paths because the seller
foundation was copied from `37d7ea5`, rather than merged as branch ancestry.
Authentication's key decision is now resolved; file conflicts still require a
real integration merge when Dev S is ready. Preserve:

- The combined auth, seller, buyer and Workflow schema/configuration.
- Exact-token membership lookup plus internally provisioned account/session
  binding and the transitional legacy migration.
- The canonical runtime contracts and generated worker export; do not restore
  the former manually maintained seller parser or JSON Schema.
- Shared seller listing-version and aggregate inventory fixes, including buyer
  reserve/lock/sell/decline transitions and expired-hold handling.
- Final-bid deferred promotion, immutable policy snapshots, shared deterministic
  fit/compatibility/unit diagnostics and the buyer recovery timers/cron.

Regenerate Convex bindings from the resolved schema instead of choosing one
branch's generated API. Run `npm run ci` on the merged code, then verify password
login/session binding, operator listing/policy edits, pause behavior and the
buyer workflow/checkout against Dev S's actual interface.

## Verified scope and remaining acceptance work

`npm run ci` passed with 84 tests: 39 backend, 25 buyer, 16 seller/schema and
4 security tests. It also passed lockfile/dependency age policy, workflow policy,
installation with lifecycle scripts disabled, package signature checks, npm audit
(zero vulnerabilities), contract export consistency, backend type checking,
lint and the production build. Additional recovery/formatting changes were
followed by targeted backend, type, lint and build checks.

The buyer Figma frame `53:1134` was checked again. Its sidebar, prompt and card
layout remain the reference. Converge branding/orange CTA differences are
nonblocking under the user's layout/color guidance and override permission.

Fresh browser acceptance is blocked by the host's missing libnspr4/libnss3/
libnssutil3/libasound libraries. T3 preview was attempted and returned that
explicit prerequisite error. Automated Convex runtime tests and the build do
not substitute for that browser check.

External CREAO/Apify/payment adapters remain the intentionally deferred final
integration step. Start/lookup adapters must reconcile using stable local job or
execution IDs when a remote reference is missing. No live-provider, real-payment
or public-deployment claim is made. No further product decisions or credentials
are needed to implement these review fixes. Provider configuration is needed
only when enabling the integrations; combined browser acceptance follows the
future Dev S merge.
