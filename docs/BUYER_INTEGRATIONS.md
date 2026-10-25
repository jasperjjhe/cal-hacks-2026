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
The agreed 75-second opening/council and 210-second overall budgets remain; CREAO
documents that runs may take minutes, so timing acceptance is unverified until
these calls pass. Requested model selection is not proof of the model actually
used; the adapter leaves unreported model provenance null.

The adapter uses the fixed CREAO API Trigger host, start/poll/cancel endpoints and
documented idempotencyKey. Agent ID/model/revision are pinned per job. Accepted
means pending, not completed. New moderator roles reject the legacy ChallengePlan.
If your account exposes a different API, supply its reference before configuring
this adapter; developer agent-creation APIs are not interchangeable with API Trigger.

## Apify: deploy the included Actor

Create a Docker-based Actor from `agents/apify-evidence/` in Apify. It uses only
Python's standard library. Pin the Docker base-image digest before recording a
verified deployment build. Build it and record the opaque Actor ID, build ID and
numeric build number (`0.1.N`, not a mutable `latest` tag).

The Actor reads platform INPUT and writes its default dataset. Input is
`{urls: string[], allowedHosts: string[]}`. Dataset rows are
`{url, excerpt, retrievedAt}`. It follows no links or JavaScript, limits itself to
eight URLs/40 excerpts, rejects private or mixed DNS answers, pins public DNS
addresses for TLS and checks every redirect. Redirected product pages are skipped
because a changed URL could represent a different variant. Blocked/JavaScript-only
pages may yield no evidence; no synthetic replacement is generated.

Set `APIFY_TOKEN` and `BUYER_EVIDENCE_REGISTRY` in Convex. Registry example:

```json
{
  "actorId": "OPAQUE_ACTOR_ID",
  "build": "IMMUTABLE_BUILD_ID",
  "buildNumber": "0.1.1",
  "sources": [
    {
      "id": "reviewed-source-1",
      "variantId": "REAL_CATALOG_VARIANT_ID",
      "url": "https://approved.example/product",
      "sourceType": "manufacturer",
      "applicability": "exact_variant"
    }
  ]
}
```

Example domains and IDs are placeholders. Review the page's exact model,
configuration, size and region before labeling it `exact_variant`; use `family`
otherwise. Supported source types are manufacturer, independent_test and
owner_report. Unspecified applicability defaults to family. Do not label a store
page as an independent test. Genuine product identities must exist in the catalog
with `syntheticProduct: false`; current fictional seed aliases intentionally do
not trigger acquisition. Coordinate genuine catalog records with the seller
owner rather than relabeling fictional fixtures as real products.

The adapter snapshots registry configuration per research job, pins the numeric
build on start, verifies returned Actor/build/run IDs, then reads only that run's
default dataset after SUCCEEDED. Excerpts are unverified source text, not ratings
or authoritative facts; this initial adapter emits no structured eligibility facts.
Existing applicability, caching and stale-run checks still apply. The Actor
selects the first 20,000 visible characters; source-specific extraction is future
work if boilerplate crowds out useful evidence.

There is no documented Actor-run idempotency key. Start transport failure becomes
unavailable without retrying; the remote run may still finish and incur usage.
Runs have a 60-second timeout and no automatic restart. Check usage in Apify;
do not claim exactly-once billing or a measured monetary cap.

## Verification and activation gate

Before adding keys, run the normal frontend checks, including `npm run test:backend`,
and `python3 -m unittest discover -s agents/apify-evidence -p 'test_*.py'`.
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
