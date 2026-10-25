# Converge

A buyer confirms a private shopping brief, compares policy-checked demo merchant
offers, and explicitly approves an exact simulated order. The buyer interface is
backed by Convex persistence, Convex Auth and durable Workflow orchestration.

Start with [frontend/README.md](frontend/README.md). Product requirements and the
owner split are in [CONVERGE_IMPLEMENTATION.md](CONVERGE_IMPLEMENTATION.md).
The [buyer handoff](docs/BUYER_BACKEND_HANDOFF.md) describes APIs, seller integration
and the remaining external adapter configuration.

We use Apify Actors for product review research: `apify/rag-web-browser` to search
and scrape editorial reviews, and optional `harshmaur/reddit-scraper` for cited
owner comments about genuine offered products. No per-product review links
are required.
See [configuration and limitations](docs/BUYER_INTEGRATIONS.md#apify-automatic-review-discovery-with-rag-web-browser).

The buyer branch now integrates seller v2 Fetch code from `dev` (`59f7de4`),
plus automatic editorial/Reddit evidence discovery. Fixture sellers remain the
explicit fallback until the Fetch gateway is configured. Inventory, prices and
checkout remain disclosed demo behavior; no real payment is taken.

See [the integrated MVP audit](docs/INTEGRATED_MVP_AUDIT.md) for verified journeys,
remaining headphone-demo blockers and the deployment checklist.

## Agreed competition revision — unified code, live provider acceptance pending

[PRD/technical spec v5.3](CONVERGE_IMPLEMENTATION.md) now requires independent
opening bids, a frozen public comparison, merchant peer challenges and grouped
replies, checked outcomes, then one sealed final invitation per eligible candidate.
The council explains supported tradeoffs; deterministic rules rank valid offers
and the buyer chooses. See [seller council handoff](docs/SELLER_COUNCIL_HANDOFF.md)
for contract, worker, workflow, privacy and acceptance work. Buyer v2 contracts and the coordinator now execute the agreed phases with seller
fixtures. See [buyer migration status](docs/BUYER_COUNCIL_MIGRATION.md) and
[two-agent CREAO setup](docs/BUYER_INTEGRATIONS.md). Seller worker/service authority
and combined live acceptance remain pending. Seller-side code is integrated;
service-option concessions still have a buyer-side restriction recorded in the audit.

## CREAO agents

| Agent ID | Install link |
| --- | --- |
| `2ec1123d-8bde-4632-a602-232fbc178ea1` | [Install agent](https://agent.creao.ai/install/2ec1123d-8bde-4632-a602-232fbc178ea1?version=d6b0ca05-95a9-4060-abd9-2d370b088cae) |
| `0b3b7449-baf6-448e-b18b-c3da3448847c` | [Install agent](https://agent.creao.ai/install/0b3b7449-baf6-448e-b18b-c3da3448847c?version=4644a8ad-1cd8-49fa-90a6-d4e4a78cf473) |
