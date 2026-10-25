# Integrated MVP audit — October 25, 2026

## Verdict

The persisted demo purchase works with the merged buyer/seller code and fixture
agents. The configured Fetch path also passes an isolated end-to-end regression
using the actual Python worker and mocked gateway transport. The planned **XM5
journey with live CREAO + Fetch + Apify is not yet a working integrated demo**:
headphone profiles/catalog and live provider activation remain incomplete.

What this repo does: Converge clarifies a private shopping request, collects
merchant offers, runs a bounded public council and sealed finals, attaches
independent evidence, then reserves stock and persists an explicitly simulated
order. This audit assumes one hackathon demo buyer and three merchants, not
production commerce. Real payments and merchant reputation remain outside scope.

## Integration reviewed

- Seller integration: `dev` at `59f7de4`.
- Buyer baseline: PR #8, squash commit `6c196af` (tree matches `9f150fa`).
- Dedicated Reddit implementation: `24bf963`, plus this integration's fixes.
- Squash ancestry caused add/add merge conflicts. Resolving against the identical
  buyer/squash trees preserved both sets of code; the remaining README conflict
  was reconciled explicitly.
- The unrelated untracked `BUYER_AUTH_AND_PAYMENTS_DRAFT.md` was left untouched
  and excluded from the commits.

## Verified behavior

| Check | Result | What it establishes |
|---|---|---|
| Browser + actual Convex development deployment | Passed | Anonymous session, persisted draft, brief confirmation, three merchants, brief/advocacy/grouped reply/adjudication, three sealed finals, results, reservation, explicit simulated approval, successful order, reload recovery and Orders receipt |
| Configured Fetch workflow regression | Passed | Real Python opening/advocacy/final logic through the seller HTTP adapter with pending/completed responses; buyer council, reservation and one idempotent persisted simulated order |
| Backend/provider tests | 63 passed | Transactions, workflow components, privacy, validation, quote/execution behavior, source attribution and partial-provider preservation |
| Buyer tests | 25 passed | Buyer contracts, comparison and offline journey regressions |
| Seller tests | 33 passed | Seller validation, service authority, provider port and inventory rules |
| Python worker tests | 9 passed | Worker logic and explicit opening-role regression |
| Canonical contract check | Passed | Application and Python worker schema exports match |
| Backend type check, lint, production build | Passed | Merged code compiles and satisfies repository checks |

The browser used localhost Vite against the user-selected development deployment
`https://little-dove-539.ca-central-1.convex.cloud`. It bought one disclosed
fictional DemoThink T14 offer for $680, displayed **“Demo order completed; no
payment taken.”**, and retained the receipt after reload and in Orders. This is
fixture-agent acceptance, not a live provider or headphone acceptance claim.

The separate recent Apify smoke runs remain evidence of live source acquisition:
RAG run `dejwZpTLQPd2cbKOW` yielded six accepted excerpts from two review sites;
dedicated Reddit run `WPIcvZbi8o8fzeL83` yielded eleven accepted comments. See
[the integration guide](BUYER_INTEGRATIONS.md) for datasets, timings, pinned builds
and limitations. Those live outputs passed local parsers; the browser purchase
above used synthetic products and therefore did not scrape reviews.

## Blockers found and fixed

### 1. Fetch opening jobs were rejected by their own worker

`agent.py` passes an explicit `seller_initial` role into `build_decision`, but the
worker previously accepted that opening path only when the role argument was
omitted. A real gateway request therefore failed despite the original eight
Python tests passing. The worker now accepts the explicit opening/response roles
and rejects a role that disagrees with the payload. A failing-before/passing-after
regression covers the exact invocation.

Files: `agents/fetch-seller/seller_logic.py`, `test_seller_logic.py`.
**Deployment action:** redeploy the fixed worker to the existing Agentverse agent;
updating Convex alone does not update the hosted Python code.

### 2. Two poll owners turned successful seller jobs into buyer failures

The seller action scheduled its own opening-job polls while the buyer Workflow
also polled. The seller could complete first, leaving the next buyer poll unable
to claim the already-completed job; the buyer treated that as a failed provider.
The new configured-provider end-to-end test reproduced completed seller jobs
with a failed buyer run. Buyer-managed dispatch now suppresses the independent
seller poll/retry scheduler. Standalone seller dispatch retains its scheduler.

Files: `frontend/convex/sellerAgent.ts`, `buyerJobs.ts`, `tests/backend.test.ts`.

## Must fix before the planned XM5 demo

### 3. Adding a Sony offer alone does not enable headphones

**Problem:** the seed catalog still contains only fictional products. There is
no XM5 listing and no profile for color, headphone type or ANC. Fixture intake
does not recognize headphones; even live CREAO is restricted to supplied profile
fields. The primary-item editor excludes the existing `tech_accessory` category,
whose only current field is `compatibleVariantIds`.

**Smallest fix:** buyer and seller agree one supported standalone headphone
profile, add black/type/ANC identity fields, then add the genuine WH-1000XM5
identity with `syntheticProduct: false` and disclosed simulated merchant offers.
Update the shared category/profile validation, editor/intake, generated worker
schemas and any existing-deployment migration together. Use the Sony product
page for identity; reviews supply opinions, not stock or fulfillment authority.

**If skipped:** an XM5 prompt cannot become a valid, matching primary request;
review scraping never starts from the buyer journey.

Evidence: `frontend/convex/buyer/intake.ts:9`, `sellerSeed.ts:38`,
`lib/sellerFixtures.ts`, `frontend/src/BackendApp.tsx:1146`.

### 4. The development deployment is configured for unsupported payment mode

**Observed:** `PAYMENT_MODE=stripe_test` while the checked-in adapter supports only
simulation. The real browser reached results, then selection failed with
“External payment is not enabled until its adapter is configured.” The UI still
said simulation. For this audit only, PAYMENT_MODE was set to simulation; the
purchase succeeded; the original stripe_test value was then restored.

**Smallest fix:** choose simulation for this hackathon demo and leave the separate
Stripe proposal deferred, or implement the payment project before enabling it.
Do not remove the fail-closed adapter guard to make checkout appear successful.

**If skipped:** checkout remains blocked in the original development configuration.
Evidence: `frontend/convex/buyer/checkout.ts:141`, `buyer.ts:203`.

### 5. Live buyer, seller and Reddit activation is incomplete

**Observed through the deployment CLI:** `BUYER_AGENT_MODE` and
`FETCH_SELLER_START_URL` were absent. The browser explicitly ran fixture agents.
`BUYER_EVIDENCE_REGISTRY` contained the RAG Actor/build but no `reddit` object.
Secret token values were not inspected. The names-only connector returned results
inconsistent with CLI/browser state, so its empty deployment/config reports are
not treated as proof that the real deployment is empty.

**Smallest fix:** configure the CREAO intake/council agents and intended live mode;
deploy the fixed Agentverse worker plus authenticated HTTPS gateway and its
FETCH_SELLER settings; add the pinned Reddit configuration from
`BUYER_INTEGRATIONS.md`. Confirm the existing APIFY_TOKEN has access in this exact
deployment. Run one new XM5 buyer request after activation; jobs snapshot config.

**If skipped:** the demo can show fixture commerce and separate live Apify tests,
but cannot honestly claim a joined live-agent research/purchase journey.

## Should fix or explicitly defer

### 6. Seller operator UI is an unconnected prototype

`SellerOperator.tsx` initializes a fixture dashboard in React state and its save
handlers update that state. `main.tsx` renders only BuyerApp; no route imports
the seller component. Existing authenticated seller APIs do not make this UI a
working operator console.

**Smallest fix:** either defer the screen and load mock data through a controlled
server migration, or route it behind operator auth and bind reads/writes to seller
APIs. Do not present in-memory edits as changes to buyer-visible stock/policy.
Evidence: `frontend/src/SellerOperator.tsx:79`, `src/main.tsx:3`.

### 7. Seller service concessions are still rejected by the buyer

The seller code now validates granted service options, but buyer final handling
still rejects every non-null `serviceOptionId` with “awaits seller integration.”
The live deterministic worker currently holds its final offer, so the passing
end-to-end test does not exercise a proposed service improvement.

**Smallest fix:** keep the demo pricing/hold-only and label it clearly, or bridge
seller-validated service terms into buyer offer, quote and order snapshots.
Evidence: `frontend/convex/buyerJobs.ts:746`,
`agents/fetch-seller/seller_logic.py:_build_final`.

### 8. Summary and provenance labels have mismatched assumptions

The run's agent label depends on buyer mode alone, so a configured Fetch seller
with fixture buyer roles is still labeled fixture. Evidence mode recognizes only
complete/cached cards; a partial card with real retained sources is labeled
unavailable. Separately, fixture summaries deliberately produce no opinion
positives/concerns for unknown-verification excerpts; all retrieved review/comment
text has that status. The live CREAO summary is needed for the intended cited
opinion synthesis, and its output still needs a deployed acceptance run.

**Smallest fix:** derive public mode/status from actual job/source provenance and
show advisory opinions separately from verified product facts. Preserve the
existing prohibition on invented citations and authoritative claims.
Evidence: `frontend/convex/buyer.ts:195`, `buyerJobs.ts:1093`.

## Ordered next steps

1. Freeze the demo on simulated payment; resolve the current stripe_test mismatch.
2. Buyer + seller add the standalone headphone profile and real XM5 identity,
   plus mock offers and a non-destructive migration for the current database.
3. Redeploy the corrected Fetch worker and gateway; configure buyer live roles,
   seller endpoints and optional Reddit in the named development deployment.
4. Run one joined XM5 browser journey: clarify black/type/ANC/budget/date,
   confirm, compare three merchants, finish council/finals, inspect editorial and
   Reddit citations/CREAO summary, reserve, approve simulation, reload receipt.
5. Rehearse a blocked source, unavailable seller and expired quote. Keep partial
   results honest and retain the working fixture fallback.
6. Defer merchant reputation, real payment, full Reddit reply-tree expansion and
   the operator UI unless the demo requires them.

## Operating notes and limits

- Code/functions and regenerated bindings were deployed to the explicitly named
  development deployment, not production. The existing seller database was not
  reset; the seed guard refused to overwrite it.
- Development anonymous-auth keys were initialized for the localhost test and
  remain in ignored `.env.auth.local` plus the development environment. Existing
  development browser sessions may need to sign in again. No keys are committed.
- One disclosed simulated purchase remains in the development database and
  consumed one unit of demo inventory. Historical orders and stock were preserved.
- The temporary simulation override was restored to its original stripe_test
  value. A new checkout is therefore blocked again until demo mode is resolved.
- The source repository Python fix was not deployed to Agentverse. The real
  HTTPS gateway, live CREAO roles and the joined XM5 journey were not verified.
- Local-only initialization and broad CLI environment listing were rejected by
  automatic approval review. Work proceeded through the user-selected existing
  deployment and targeted non-secret settings; no broad secrets listing was used.
- No claim of live payment, unbiased consensus, verified Reddit ownership,
  production readiness or sponsor eligibility follows from these checks.

**Verdict:** the supported fixture-commerce journey works and two integration
blockers are fixed. Finish headphone modeling and activation before pitching the
full XM5/live-agent demo.
