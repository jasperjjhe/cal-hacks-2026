# Dev B buyer backend: local foundation

## Confirmed working decisions

- Dev B works on `dev`; Dev S works independently and integrates later.
- CREAO is selected for buyer intake, moderation and evidence summarization.
  Seller provider selection remains S's responsibility.
- Convex deployment/account setup is deferred. No deployed backend exists.
- The original split leaves production frontend ownership with the UI team. The
  user subsequently authorized Dev B to build a working buyer-interface mock
  from the changing Figma design. `frontend/README.md` records that implementation
  and its local-only limitations. Simulation remains the checkout default.

## Current implementation

`frontend/src/contracts/index.ts` is the runtime schema source. TypeScript types
are inferred from it; `schema.json` is generated for worker consumers. Import
types from this source rather than copying interfaces into a second package.
Objects reject unknown fields and all wire fields are required or explicitly
nullable. Bounds on strings, collections and safe integer money are enforced.

The contract subset covers requests, profiles, intake/drafts, offers, buyer views,
evidence, quote/execution responses, and draft/confirmation commands. It is a
**draft revision**, not a completed F0 freeze. Remaining seller catalog/policy,
allocation, round, role-output and public API command schemas must be added with
S's review before their boundaries are implemented. JSON Schema validates shape;
it does not replace ownership, provenance, category or current-state checks.

`frontend/src/backend/buyer/requests.ts` validates confirmation structure,
deadline, unique line/requirement IDs and separate target consent. It requires an
injected S-owned profile validator; it does not supply a permissive default.
The seller projection selects only the confirmed brief fields, excluding private
ceiling, raw messages and origins. It replaces the use-case summary with a neutral
category/quantity template so copied private prose cannot enter that field.
Profile-backed, reviewed public goal templates remain needed for richer context;
S must still validate requirement fields/values before confirmation. Indirect-budget and prompt-injection acceptance cases remain
required for the future intake/confirmation implementation.

`comparison.ts` implements the four documented stable orders and seller-diverse
shortlist, excluding expired/nonselectable/failed-hard-check offers. It expects
one effective version per offer, current S assessments and B affordability.
Mixed scored/unscored snapshots fail instead of producing inconsistent sorting.
It neither assesses product facts nor authorizes selection or stock holds.

`integrations/agents.ts` defines the internal provider port and the CREAO buyer
role selection. It contains **no live transport**, invented runtime endpoint,
provider credentials or asserted model. Fixture mode is separate from provider
identity. Context7 returned no relevant CREAO library; the official documentation
entry serves a JavaScript shell, so its actual runtime API still needs inspection
and a project-specific smoke test before implementation.

## Local commands

Use Node 24 (`frontend/.nvmrc` pins 24.18.0; package engines allow compatible 24.x).
This machine also has compatible 24.21.0 installed. From `frontend/`:

```sh
npm run security:dependencies
npm ci --ignore-scripts
npm run contracts:export # after schema changes; commit the generated export
npm run contracts:check
npm run test:buyer
npm run lint
npm run build
```

`npm run ci` additionally runs signatures, audit and repository security gates.
Security boundary tests remain dependency-free so CI can run them before
installation; buyer tests run after dependency installation. Zod 4.6.7 is pinned
in the existing frontend lockfile and subject to the same seven-day policy.
No extra package manager, root lockfile or second install tree was introduced.

## Dev S integration agreement still needed

Review the draft schema source and one laptop/clothing payload in
`frontend/src/contracts/fixtures.ts`. In particular, agree profile IDs/field units
and these interfaces from implementation document sections 3 and 6:

- `prepareSellerJob`, `validateAndStoreProposal`, and `assessOffer`.
- `reserveInTransaction` and `transitionAllocationInTransaction`.
- Final-bid private staging and atomic promotion on B's round closure.

S owns the stock/pricing/eligibility algorithms. B owns the surrounding mutations,
affordability and lifecycle. Allocation helpers must run inside the same Convex
transaction as the quote/approval/order write; never replace this with successive
network calls. The pure functions here are not a persistence layer or temporary
database.

## Next implementation sequence

1. Complete F0 schemas/fixtures with S review, then configure the Convex schema,
   Auth skeleton, Workflow component and generated bindings. No frontend auth
   layout changes are part of B's work.
2. B1: implement authenticated persistent drafts, versioned confirmation, safe
   public projection, run stages, rate limits, stale completion checks and fixture
   dispatch. Test cross-buyer reads, cancellation and reload through real functions.
3. B2: integrate S's real transactional stock helpers for quote, hold, exact-hash
   approval, idempotent simulation, decline and unknown reconciliation.
4. Wire tested CREAO operations behind the port. Obtain project/agent identifiers
   and server-only credentials privately when a concrete live operation is ready.
   Verify supported non-Gemini reasoning and accepted-versus-completed semantics.
5. B3: council/conditional sealed round, real Apify evidence and bounded refill.
   Supply the full UI fixture bundle and live development API to the UI team.

Contract amendments proposed for F0: `BuyerRunView.modes.agents` admits `mixed`
to label mixed fixture/live work honestly. This is additive to the handoff's type
snippet and implements its explicit provenance requirement. The sort mutation,
event pagination envelope/cursor, full quote variant/condition snapshot and
merchant analytics response still require agreement; no endpoint has been
invented for these.

## Verification boundary

The local tests exercise pure validation, privacy projection and deterministic
comparison. They do not prove Convex authentication, atomic stock, durable jobs,
CREAO/Apify access or purchase behavior. Those acceptance gates remain open.
Nothing has been pushed, deployed, published or communicated to Dev S externally.
