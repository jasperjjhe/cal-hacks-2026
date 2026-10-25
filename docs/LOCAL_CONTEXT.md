# BuyerUnion local working context

This file is the durable working context for the BuyerUnion implementation
thread. Read it before every implementation turn, confirm the current status
against the repository, and update it whenever a decision, constraint, test,
deployment state, sponsor claim, or next step changes. It is a project context
record, not a substitute for the authoritative implementation specification.

Last reviewed: 2026-10-24  
Current checkout: `C:\Users\Jasper\Documents\cal-hacks-2026`  
Current branch: `feature/seller-side`  
Current pushed commit: `66b9a27` (`docs: define Chat Protocol boundary`)  
Remote status at last review: clean and synchronized with
`origin/feature/seller-side`

## Per-turn operating protocol

At the start of every turn:

1. Read this file and the relevant authoritative documentation.
2. Check `git status`, the active branch, remote divergence, and any changed
   files before editing.
3. Confirm that the requested work stays within seller-side ownership and does
   not create a second buyer workflow, database, evidence store, checkout
   authority, or provider call.
4. Check the security and sponsor-eligibility rules below before adding a
   dependency, endpoint, credential, workflow, agent capability, or external
   claim.
5. Update this file with the current status and plan when the turn changes
   project state.
6. Implement in small checkpoints, run proportionate tests, commit, and push
   frequently to the active feature branch.
7. Report compliance status, tests, commit/push status, blockers, and next
   steps in the final response.

Do not paste secrets into chat or source control. If a credential is needed,
use the product's private secret-entry mechanism or a protected local shell.

## User requirements and collaboration constraints

- The current work is seller-side only. The buyer side is being developed on
  `origin/geoff/buyer` and will integrate later.
- Seller work owns merchant catalog, policy, inventory, seller jobs, seller
  proposals, seller validation, and the provider seam. Buyer work owns buyer
  requests, raw buyer messages, private budgets, council/workflow state,
  evidence acquisition, comparison, quote approval, and purchase execution.
- Fetch.ai and CREAO are both intended, but with distinct roles: Fetch is the
  current seller-agent target; CREAO is reserved for the buyer-owned intake,
  comparison/council, or bounded evidence-explanation role. Do not run both for
  one seller job or use one as silent failover.
- Convex is the authoritative backend/state store. The implementation must
  preserve one source of truth and use internal functions for buyer-to-seller
  handoff.
- The project is targeting the Visa shopping track. Visa remains
  simulation-first until a supported sandbox operation is actually tested and
  truthfully documented.
- Coinbase/x402 is a separate, bounded machine-to-machine evidence/payment
  capability, not a Visa purchase and not a browser wallet flow.
- Mana is the selected hosting direction. The exact Mana runtime, endpoint,
  credentials, and live proof still need to be configured.
- Apify remains a buyer-side evidence actor/service unless the product owner
  intentionally assigns it a seller role that is genuinely central.
- Push implementation checkpoints to the feature branch; the user explicitly
  asked that changes actually be pushed.
- If delegating work, use GPT-5.6 Luna with maximum reasoning as requested. Ask
  before using a different provider/model. No delegated model is currently
  required for the active Fetch implementation.
- Main must not require a second human approval for PRs. The checked-in branch
  protection policy sets required approving review count to `0`; GitHub's
  external setting still needs verification/application by an administrator.

## Authoritative documentation and precedence

1. `BUYERUNION_IMPLEMENTATION.md` is the active product/backend
   specification. Sections 3, 5, 6, 7, 8, 11, 12, 15, 16, 17, 19, and 20 are
   especially relevant to seller work.
2. `docs/SELLER_IMPLEMENTATION_PLAN.md` is the seller execution plan.
3. `docs/BUYER_SELLER_INTEGRATION_NOTES.md` is the merge boundary with the
   buyer branch.
4. `docs/SELLER_FETCH_CONFIGURATION.md` is the Fetch deployment handoff.
5. `docs/SELLER_SPONSOR_PROOF.md` is the evidence ledger; code, a logo, a key,
   or a slide is not live sponsor proof.
6. `SECURITY.md`, `frontend/.npmrc`, `security/dependency-policy.json`,
   `.github/main-branch-protection.json`, and `.github/workflows/*` are release
   and security gates.
7. `buyerunion-prd-v4-source.md` and the PDFs are historical/reference
   material, not competing implementation specifications.

## Current architecture

### Seller side

- `frontend/convex/schema.ts` stores seller-owned merchants, profiles,
  products, variants, immutable listing/policy versions, inventory
  allocations, seller jobs, sanitized job inputs, events, and offer versions.
- `frontend/convex/seller.ts` exposes authenticated merchant-scoped operator
  reads/writes.
- `frontend/convex/sellerInternal.ts` provides internal preparation,
  sanitized brief attachment, provider-job claims, proposal validation, and
  immutable offer persistence.
- `frontend/convex/sellerAgent.ts` is the server-only provider action. It
  starts, polls, reconciles, and best-effort cancels provider jobs; it handles
  pending and ambiguous states; and it routes terminal output through
  deterministic Convex validation.
- `frontend/convex/lib/sellerContracts.ts` and
  `frontend/convex/lib/seller.schema.json` are the canonical strict seller
  contracts.
- `frontend/convex/lib/sellerValidation.ts` recomputes category/profile/
  condition fit, stock, price floors, shipping, contribution, and policy
  terms. Provider/model totals are never authoritative.
- `frontend/convex/lib/sellerInventory.ts` contains transactional reservation,
  execution-lock, sale, release, expiration, and idempotent replay helpers.
- `frontend/convex/integrations/` contains the provider-neutral port, fixture
  provider, Fetch adapter, CREAO adapter, HTTPS host allowlists, bounded
  timeouts, idempotency keys, and provider-run provenance.

### Fetch seller agent

- `agents/fetch-seller/agent.py` is an Agentverse-compatible uAgent with fixed
  typed POST routes:
  - `/seller/jobs` — idempotent start;
  - `/seller/jobs/poll` — known-run polling;
  - `/seller/jobs/reconcile` — application-job reconciliation;
  - `/seller/jobs/cancel` — best-effort cancellation.
- `agents/fetch-seller/seller_logic.py` is dependency-free bounded catalog
  matching. It rejects private fields, oversized/non-JSON input, wrong merchant
  scope, malformed catalog/policy data, unsupported units, and unknown hard
  requirements. It proposes the public reference price only.
- Agent Storage holds only bounded job metadata, the input digest, state, and
  the validated decision. It does not store the shared token or full inbound
  request envelope.
- The shared Agentverse secret is required and fails closed when missing or
  incorrect. Convex sends it only from the server-created provider envelope.
- The agent source is implemented and tested locally, but no real Agentverse
  URL, agent address, secret, or live provider run has been configured or
  claimed yet.
- Transport caveat: official Agentverse hosting documentation exposes hosted
  agent identity/control metadata and message-envelope submission, while the
  uAgents custom REST documentation demonstrates direct routes on the running
  agent. A hosted-agent address/control-plane URL must not be assumed to proxy
  arbitrary custom REST routes. Verify that explicitly; otherwise run the same
  agent on the team's public Mana HTTPS endpoint (optionally with mailbox
  registration) and point Convex at that exact endpoint.

### Buyer-side boundary

When integrating `origin/geoff/buyer`:

1. The buyer workflow builds an allowlisted `SellerBrief`.
2. It calls `internal.sellerInternal.prepareSellerJob` with the server-owned
   job/request/run/phase/merchant/candidate/policy references.
3. It attaches the brief atomically or with `attachSellerBrief` before dispatch.
4. It calls `internal.sellerAgent.dispatch` exactly once for that seller job.
5. The buyer workflow consumes seller status/provenance and validated offer
   data; seller code never closes a buyer run or executes checkout.
6. Generated Convex bindings are regenerated once after the unified schema is
   merged; `_generated` files must not be hand-written or duplicated.

Known buyer-branch hazard: its generic live provider mapping currently points
live agent roles to CREAO. A Fetch seller job must use the seller action and
must not also be started by that generic buyer dispatcher.

## Sponsor strategy and evidence status

### Primary, role-aligned targets

- **Convex:** real seller backend, reactive scoped operator view, durable job
  state, immutable versions, and atomic inventory helpers. Live proof must show
  merchant isolation and reservation contention behavior.
- **Fetch.ai:** real seller work through the Agentverse-compatible seller
  agent. The live proof must show a reachable agent, pending-to-terminal run,
  accepted schema-valid proposal, replay/reconciliation, and failure recovery.
- **CREAO:** buyer-side core role such as intake, comparison/council, or
  bounded evidence explanation. It must do meaningful runtime work, not merely
  generate code or provide a peripheral summary.
- **Visa:** buyer-side reimagined shopping flow with transparent simulation or
  a verified supported sandbox operation. Quote hash, merchant mapping,
  idempotency, and unknown-state reconciliation are required.
- **Mana:** actual hosting/build/runtime contribution, public Mana pages/chats,
  and a demo moment showing how Mana changed the build.
- **Apify:** buyer-side evidence acquisition or a first-party evidence actor,
  with URL/source allowlists, SSRF/redirect controls, normalized evidence, and
  a meaningful live run.
- **Coinbase/x402:** one bounded paid evidence lookup or similar machine-to-
  machine capability after the core path works; use fixed asset/network/
  destination allowlists, caps, idempotency, and reconciliation.

### Conditional or deferred targets

- **Factory Droid:** seller operator listing/policy audit with visible plan,
  bounded access, diff, approval gate, and result. Deferred until the SDK and
  runtime can be installed under the seven-day package rule and shown live.
- **Hyphenate, Microsoft, Anthropic, Meta, Figma, Notability, Cartesia, Moss,
  Elastic, CRS, Armadin, Bitdeer, SpaceXAI, Atlassian, SpacetimeDB:** pursue
  only when a real product role and submission artifact can be demonstrated.
  Do not add incidental SDK/logo usage.
- Avoid a second authoritative realtime database (SpacetimeDB) while Convex
  owns state, unless the product is deliberately re-scoped.
- No Gemini integration or Gemini prize target.

Every sponsor claim needs a ledger row with technology, feature, exact code
path, live URL/run ID, mode (`live`, `fixture`, `simulation`, etc.), what is
simulated, and known limitations.

### Full sponsor inventory supplied in the thread

The thread included these prize tracks: Notability; Meta/Facebook; Nessie;
Factory Droid SDK; Fetch.ai; Armadin security; Coinbase x402; CREAO AI
(AI-First Disruptor, One-Person Company, and Team Empowerment); CRS Credit API
(overall, financial agent, identity/fraud, and unexpected use); Hyphenate
finance autonomy; Cartesia; Bitdeer AI Model Studio; Figma; Moss; SpaceXAI;
Convex; Microsoft Grand Prize and Customer Impact; Apify and Best Actor; Elastic;
Visa shopping; Anthropic; Atlassian; Bright Data; Mana; and SpacetimeDB.

The working strategy is to maximize credible overlap around the commerce flow,
not to add disconnected integrations: seller Fetch/Convex, buyer CREAO/Apify/
Visa/Coinbase-x402/Mana, and optional Factory/Hyphenate/Microsoft/Anthropic/
Figma/Notability evidence only when the feature is genuinely central and the
required demo/artifacts can be produced. “Superficial sponsor usage” means a
dependency, logo, generated code, incidental summary, or slide-only demo that
does not perform meaningful work in the running product or satisfy the track's
specific proof criteria.

## Security and supply-chain rules

- `frontend/package-lock.json` stays committed; CI/deployment uses `npm ci`.
- Dependencies resolve only from `https://registry.npmjs.org/`, with lockfile
  SHA-512 integrity and the emergency compromised-version blocklist.
- A package release must be at least seven full days old. This is enforced by
  `frontend/.npmrc` (`min-release-age=7`),
  `frontend/scripts/check-dependencies.mjs`, and boundary tests. Missing or
  ambiguous registry timestamps fail closed.
- Lifecycle scripts are untrusted. `npm ci --ignore-scripts` is mandatory;
  exact reviewed exceptions are recorded in
  `security/allowed-install-scripts.json` and are not executed by CI.
- Every protected-branch change runs dependency policy, signatures/provenance,
  high-severity audit, dependency review, workflow checks, SBOM generation,
  lint, and build. GitHub Actions are pinned to full commit SHAs, use least
  privilege, do not persist checkout credentials, and do not expose secrets to
  untrusted PR jobs.
- If Shai-Hulud-style exposure is suspected: stop installs/builds/deploys and
  wallet activity; preserve lockfile/logs; inspect dependency trees, caches,
  workflows, webhooks and OAuth apps; rotate npm/GitHub/cloud/Convex/Mana/
  provider/Coinbase/wallet credentials; rebuild on a clean runner and checkout;
  and record scope and timestamps. Do not run an install to “repair” a suspect
  environment.
- Agent/model/crawler/callback input is hostile. Use strict schemas, bounded
  arrays/strings, HTTPS exact host allowlists, SSRF/private-network blocking,
  redirect revalidation, timeouts, retry caps, idempotency, safe projections,
  and explicit egress allowlists.
- Convex derives identity from authenticated context. Browser-supplied owner,
  role, merchant, provider run, or record IDs are never authorization.
- Never put provider tokens, wallet seeds, Convex deploy keys, Mana secrets,
  raw buyer prompts, private budgets, or hidden seller pricing in source,
  fixtures, logs, screenshots, or model context that does not need them.
- Never expose hidden chain-of-thought. Show bounded plans, tool calls, source
  evidence, diffs, safe summaries, and outcomes.

## Branch and synchronization status

- `origin/main` and `origin/dev` are synchronized at the remote (0/0
  divergence at last check).
- The local `main` branch is one commit behind `origin/main`; do not silently
  rewrite or reset it. Refresh it only as an explicitly requested maintenance
  step.
- `origin/feature/seller-side` is clean and synchronized with the current
  checkout at `d4cd902`.
- `origin/feature/seller-side` is 11 commits ahead of `origin/dev`; this is
  expected for the active seller feature branch.
- `origin/geoff/buyer` and the seller feature branch have diverged (6 commits
  unique to buyer, 11 unique to seller at last check). Integrate through the
  documented internal seam rather than copying duplicate implementations.
- Checked-in main protection at `.github/main-branch-protection.json` requires
  the `security` and `dependency-review` checks, a PR, linear history,
  conversation resolution, no force pushes/deletions, and **zero required
  approving reviews**. The external GitHub setting must still be verified by
  an administrator.

## Convex and deployment state

- Convex development deployment is linked and has generated bindings committed:
  `https://little-dove-539.ca-central-1.convex.cloud`.
- Dashboard: `https://dashboard.convex.dev/t/jasper-he/cal-hacks-2026/little-dove-539`.
- `.env.local` and deployment credentials remain ignored and must never be
  committed.
- The development deployment is smoke-test evidence, not production/Auth or
  sponsor evidence.
- Fetch Agentverse URL, Agent Secret, Convex Fetch environment variables,
  production Convex/Auth, Mana runtime, CREAO project/agent, Visa operation,
  and buyer-side live proof remain external handoffs.
- The Fetch transport decision is pending direct-route verification: Hosted
  Agent direct REST if the dashboard exposes it; otherwise Mana/public HTTPS
  runtime plus Agentverse mailbox/discovery.
- Chat Protocol decision: it may be added as an optional public Agentverse/
  ASI:One discovery and demo surface, but it is not the seller-job transport or
  source of truth. Chat messages are not allowed to carry raw buyer prompts,
  private budgets, competitor data, hidden seller pricing, or arbitrary job
  commands. Any future Chat handler may answer public capability/catalog
  questions only. Core seller work remains the strict REST contract or a
  custom typed uAgents Protocol/Dialogue with Convex-owned job scope,
  idempotency, and reconciliation.

## Current implementation status

Status at this context update: **seller runtime implemented; external Fetch
deployment and buyer integration pending.**

Completed:

- Seller contracts, validation, inventory helpers, Convex schema/functions,
  provider-neutral adapters, job orchestration, fixture catalog, and tests.
- Agentverse-compatible Fetch seller source, fixed typed REST routes, shared
  secret authentication, Agent Storage state, replay protection, bounded
  matching, and pure Python tests.
- Fetch configuration, sponsor proof, seller implementation plan, and buyer/
  seller integration notes updated.
- Branch protection policy checked in with no required second approval.
- Supply-chain controls and seven-day package-release-age policy implemented.
- Full CI passed on the Fetch checkpoint: security tests, seller tests,
  Convex typecheck, dependency/workflow policy, `npm ci --ignore-scripts`, npm
  signatures, high-severity audit, lint, and production build.
- Repository documentation and Markdown were reviewed for duplicate
  implementations; the canonical seller contracts and generated Convex API
  remain single-source, with no second seller workflow or duplicate provider
  authority introduced.

Pending:

- Create and start the Agentverse Hosted Agent; set its private shared secret;
  obtain the agent identity and verify whether it exposes direct HTTPS custom
  REST routes. If not, deploy the same source on Mana/public HTTPS with
  mailbox registration.
- Configure Convex `FETCH_SELLER_*` variables in the target deployment without
  exposing values.
- Capture live Fetch run/replay/poll/reconcile/cancel/failure evidence in the
  sponsor ledger.
- Finish a seller-only operator/demo surface and buyer-to-seller integration
  tests.
- Merge with the buyer branch only after contract regeneration and duplicate
  provider-dispatch review.
- Configure and prove CREAO buyer role, Apify evidence, Visa simulation,
  Coinbase/x402 bounded capability, Mana hosting, and any optional sponsor
  tracks that have a genuine core role.

## Immediate next steps

1. In Agentverse, create a Hosted Agent, copy `agents/fetch-seller/agent.py`
   and `seller_logic.py`, add `FETCH_SELLER_SHARED_TOKEN` as an Agent Secret,
   and start it. Do not paste the secret into chat.
2. Verify the four agent routes and record the exact public HTTPS host, agent
   address, runtime version, and non-secret test run IDs.
3. Set the documented `FETCH_SELLER_*` variables with `npx convex env set` in
   the protected `frontend/` shell.
4. Run the live seller acceptance matrix: valid proposal, no-match abstain,
   replay with same digest, replay with changed digest, pending-to-completed
   polling, ambiguous-start reconciliation, cancellation, malformed output,
   timeout, and auth rejection.
5. Append the evidence to `docs/SELLER_SPONSOR_PROOF.md`, then build the
   seller-only operator/demo flow and its integration tests.
6. Cross-reference `origin/geoff/buyer`, regenerate Convex bindings once,
   integrate through `prepareSellerJob`/`attachSellerBrief`/`dispatch`, and
   verify there is exactly one provider call per seller job.
7. After the core seller/buyer demo works, implement buyer-owned CREAO,
   Apify, Visa, Coinbase/x402, and Mana proof in separate small checkpoints.

## Required status wording for future turns

Use these distinctions explicitly:

- **Implemented:** checked-in code/tests exist and local/CI checks pass.
- **Configured:** deployment/environment values exist in the target system but
  are not necessarily live proof.
- **Live evidence:** a judge-reproducible run/URL and non-secret provenance are
  recorded in the sponsor ledger.
- **Fixture/simulation:** deterministic or sandbox behavior only; never present
  it as a real provider, payment, production, or sponsor run.
- **Blocked:** only when the same external condition has prevented meaningful
  progress for three consecutive turns; otherwise call it pending or an
  external handoff.

