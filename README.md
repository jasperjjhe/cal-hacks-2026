# BuyerUnion

A buyer confirms a private shopping brief, compares policy-checked demo merchant
offers, and explicitly approves an exact simulated order. The buyer interface is
backed by Convex persistence, Convex Auth and durable Workflow orchestration.

Start with [frontend/README.md](frontend/README.md). Product requirements and the
owner split are in [BUYERUNION_IMPLEMENTATION.md](BUYERUNION_IMPLEMENTATION.md).
The [buyer handoff](docs/BUYER_BACKEND_HANDOFF.md) describes APIs, seller integration
and the remaining external adapter configuration.

Product review research now uses Apify RAG Web Browser to automatically search and
scrape review sources for genuine offered products. No per-product review links
are required. See [configuration and limitations](docs/BUYER_INTEGRATIONS.md#apify-automatic-review-discovery-with-rag-web-browser).

Dev B works on `geoff/buyer`; Dev S works independently. The current buyer implementation
imports seller source from `feature/seller-side` at `37d7ea5`, with the integration
changes listed in the handoff. No public deployment is configured. All inventory,
merchant prices and checkout are disclosed demo behavior; no payment is taken.

## Agreed competition revision — buyer implemented, seller integration pending

[PRD/technical spec v5.3](BUYERUNION_IMPLEMENTATION.md) now requires independent
opening bids, a frozen public comparison, merchant peer challenges and grouped
replies, checked outcomes, then one sealed final invitation per eligible candidate.
The council explains supported tradeoffs; deterministic rules rank valid offers
and the buyer chooses. See [seller council handoff](docs/SELLER_COUNCIL_HANDOFF.md)
for contract, worker, workflow, privacy and acceptance work. Buyer v2 contracts and the coordinator now execute the agreed phases with seller
fixtures. See [buyer migration status](docs/BUYER_COUNCIL_MIGRATION.md) and
[two-agent CREAO setup](docs/BUYER_INTEGRATIONS.md). Seller worker/service authority
and combined live acceptance remain pending; no seller branch was changed.
