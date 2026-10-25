# Buyer CREAO and Apify setup

Buyer council v2 is implemented with fixture seller roles. No external accounts,
keys or deployments were changed. See [buyer migration status](BUYER_COUNCIL_MIGRATION.md)
for runtime behavior, seller handoff and remaining live acceptance.

## Configure exactly two saved CREAO agents

1. At agent.creao.ai, create/save **BuyerUnion Intake** using the
   [intake definition](creao/BUYER_INTAKE_AGENT.md).
2. Create/save **BuyerUnion Council** using the
   [council definition](creao/BUYER_COUNCIL_AGENT.md).
3. Give each saved agent one required text input named `prompt`. No connectors,
   browser tools or payment permissions are needed. The backend supplies each
   job's role, scoped data, instruction and exact output JSON Schema.
4. Record their non-secret app IDs. Create an account API key that can invoke
   both agents. Use the saved agents’ default model, or optionally select an available
   non-Gemini `chatModelId` from your account. The default model identity is unverified
   unless the provider reports it.
5. Add these **backend** variables to the intended Convex development deployment:

```text
CREAO_API_KEY=<secret account key>
CREAO_INTAKE_AGENT_ID=<saved Intake app ID>
CREAO_COUNCIL_AGENT_ID=<saved Council app ID>
CREAO_BUYER_MODEL_ID=<optional override; omit to use the CREAO default>
CREAO_BUYER_CONFIG_REVISION=council-v2
BUYER_AGENT_MODE=live
```

The two agents cover four runtime roles: Intake handles `intake`; Council handles
`moderator_brief`, `moderator_adjudication` and `evidence_summary`. Every invocation
starts a new isolated conversation; no threadId or private buyer history is
shared with Council. Seller roles remain fixtures until Dev S connects Fetch.

If `buyerAdmin:configureDemo` previously stored `agents: "fixture"`, change it to
`"live"` as well; it overrides the environment for new runs. Intake uses the
environment flag. New runs report mixed mode. Let legacy in-flight runs finish
or cancel them before deploying this workflow migration.

Keep provider keys in Convex environment settings; frontend `.env.local` values
are not automatically backend configuration. Never use VITE-prefixed names for
secrets, commit them or paste them into chat. The optional legacy
CREAO_BUYER_AGENT_IDS role map still works with the new roles and council-v2
revision, but the two explicit agent IDs are the recommended setup.

## Test before enabling it for a buyer

Normal deterministic checks require no credentials. To verify the saved agents
directly, use a separate ignored `.env.creao.local` containing the required CREAO
variables above (model override optional). From `frontend/`, with Node 24:

```sh
node --env-file=.env.creao.local scripts/smoke-creao.mjs
node --env-file=.env.creao.local scripts/smoke-creao.mjs --live
```

The first command checks configuration without provider calls. The second makes
four potentially billable isolated calls: intake, brief, adjudication and evidence
summary. It validates schema/envelope, references and basic uncertainty behavior,
prints only non-secret run IDs/timing, and cancels a known pending run if its
role budget expires. It does not modify commerce state. An ambiguous start with
no received run ID can still finish remotely; inspect CREAO usage if it times out.
Live smoke uses disclosed synthetic demo product data, not fabricated reviews.

Next deploy with `npx convex dev` against the intended development backend, seed
only a new empty catalog as described in the frontend README, and complete the
browser path: chat → explicit confirmation → council → checked offers → approval
→ simulated order → reload. Do not reset an existing catalog or auth keys.
Record each role's non-secret run ID, pending/terminal status and cold/warm timing.
The user approved 90-second CREAO role waits and an eight-minute overall MVP
cap after live calls completed in about 47–57 seconds. Polling uses 15-second
intervals, while model/tool caps stay unchanged. New runs use the revised schedule. Requested model selection is not proof of the model actually
used; the adapter leaves unreported model provenance null.

CREAO may return the actual JSON in an artifact while text/chatText contain
summaries. The adapter validates inline JSON or downloads application/json artifacts
from that authenticated run only. One signed redirect to CREAO’s observed storage
bucket is allowed without forwarding the API key; other redirects are rejected.

The adapter uses the fixed CREAO API Trigger host, start/poll/cancel endpoints and
documented idempotencyKey. Agent ID/model/revision are pinned per job. Accepted
means pending, not completed. New moderator roles reject the legacy ChallengePlan.
If your account exposes a different API, supply its reference before configuring
this adapter; developer agent-creation APIs are not interchangeable with API Trigger.

## Apify: automatic review discovery with RAG Web Browser

The buyer backend now runs Apify's maintained `apify/rag-web-browser` Actor
(`3ox4R101TgZz67sLr`). You do not create an Actor or supply review URLs.
The old `agents/apify-evidence/` Python Actor is retained as a legacy utility;
the buyer flow no longer calls it.

After final offers, research uses the genuine catalog product title to generate a
search for reviews, then filters results using a server-owned domain policy. It requests
up to six search results with fast HTML scraping and Markdown output. Browser rendering
is not enabled by default: the live browser-mode check exceeded the 60-second budget. Private buyer messages,
budget and delivery details are not sent to the search engine. Search results are
filtered by approved final URL, successful fetch, retrieval freshness and model-name
match. This is a relevance heuristic, not independent fact verification. Pages may
mention competing models, and an approved publication is not a guarantee of unbiased
content. Reddit and Ars forum excerpts are labeled owner reports; other configured
editorial domains are labeled independent tests. Discovery attaches family-level,
unverified evidence only, never exact-variant eligibility facts or verified purchases.
The existing evidence-summary agent receives these cited excerpts.

### Configuration (Convex backend, same deployment as the demo)

1. Keep `APIFY_TOKEN` in Convex Settings → Environment Variables. Never use a
   `VITE_` variable or put the token in source control/chat. It must permit running
   the public RAG Actor and reading its runs/datasets; your account needs credits.
2. Replace `BUYER_EVIDENCE_REGISTRY` with this JSON (no `sources` array):

```json
{
  "actorId": "3ox4R101TgZz67sLr",
  "build": "uhqoj67lF26kOBcwj",
  "buildNumber": "1.0.33"
}
```

This build pair came from the public Actor's `version-1` build metadata on
2026-10-25. The adapter pins the numeric version and checks the returned build ID.
If the provider removes this version, choose another numeric build and update both
values together from Apify's build details, then test one run.

3. Deploy the changed Convex functions from `frontend/` using your existing
   `npx convex dev` development process, or `npx convex deploy` for production.
   Select the intended deployment before setting its variables.
4. Ensure the seller catalog actually offers **Sony WH-1000XM5**, with a genuine
   product title/model identity and `syntheticProduct: false`. Seller stock, prices
   and checkout can remain disclosed simulations. Do not rename fictional laptops
   or mark fictional products genuine. The existing seed catalog does not yet
   contain headphones; this transport change does not migrate catalog data or add
   a headphone requirements profile. Coordinate that separate seller/intake change.
5. Start a **new buyer run**: jobs snapshot config, so old jobs keep old inputs.
   Review Apify Runs and the buyer evidence panel. Empty/blocked results must
   remain unavailable, without invented review claims.

Optional `domains` overrides the built-in list: `rtings.com`, `soundguys.com`,
`whathifi.com`, `techradar.com`, `tomsguide.com`, `arstechnica.com`, `reddit.com`, `headphonesty.com`,
`headphonesaddict.com`, `hifioasis.com`.
These are source-selection rules, not per-product link maintenance. Restrict overrides
to editorial publications and owner communities: the current source classifier
labels non-Reddit/non-Ars-forum pages as independent tests. Manufacturer/store pages
need a separate classification change before inclusion.

### Recorded live check (2026-10-25)

Pinned build `1.0.33` completed run `ZuJ56vu39hzvUjo7C` in 42.409 seconds
(dataset `ro8jNdWbSWRfHjzVc`), searching `Sony WH-1000XM5 review` with the
same six-result/HTML settings as the adapter. Six pages were scraped. A local
response-shape check fed the actual returned rows through the adapter and retained
nine excerpts from three approved matching pages (HeadphonesAddict, HiFi Oasis,
Headphonesty). The other domains and a WF-1000XM5 earbuds review were excluded.
This establishes live discovery/retrieval and parser compatibility, not a deployed
Convex buyer journey, unbiased consensus, or successful Reddit extraction. Earlier
raw-HTML Reddit results were blocked/empty; browser mode timed out at 60 seconds.

### Bounds and limitations

The adapter polls the expected run and reads only its successful default dataset.
It keeps at most 12,000 characters per accepted page in 4,000-character excerpts,
deduplicates page URLs and retains the existing 24-hour cache. Research remains
bounded by the workflow's 60-second research deadline; starts use a 60-second
Actor timeout, 40-second request budget, 4096 MB memory and no automatic restart.
There is no automatic start retry or claim of exactly-once billing. Concurrent
products may exceed the account memory quota; check the account's limits.

A general web browser cannot guarantee Reddit comments, paywalled articles or
JavaScript-heavy content. Missing/blocked pages are discarded. Discovery may return
no acceptable sources even when the Actor itself succeeds. Merchant reputation
research and specialized Reddit comment extraction are not implemented in this
product-variant research path. No real purchase or full live buyer journey is
established by an Actor-only test.

## Verification and activation gate

Before adding keys, run the normal frontend checks, including `npm run test:backend`,
and backend type checking. The legacy Python worker tests are optional for this RAG integration.
Adapter tests mock fetch; they do not establish hosted API behavior or credits.

After configuration, test one real run of each CREAO role, including pending to
terminal and accepted-then-timeout behavior. Verify strict output, model selection
and measured latency. Test Apify on one genuine laptop and one genuine non-tech
product, plus wrong identity and blocked-source cases. Complete an authenticated
buyer purchase with live buyer roles, fixture sellers and simulated payment,
then reload and check persisted sources/order. Also exercise cancellation,
revision, source failure and unknown payment recovery. Record commit, configuration
revision, non-secret run IDs, timings and limitations. Combined live seller
acceptance follows branch consolidation; Visa and Coinbase are not prerequisites.

## API references

- [CREAO API Trigger and examples](https://community.creao.ai/AI_hackathon_UCLA2026/tech)
- [Apify run Actor](https://docs.apify.com/api/v2/actors-runs-post)
- [Apify get run](https://docs.apify.com/api/v2/actor-run-get)
- [Apify get dataset items](https://docs.apify.com/api/v2/dataset-items-get)
