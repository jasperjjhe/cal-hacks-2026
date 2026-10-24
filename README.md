# BuyerUnion

A buyer confirms a private shopping brief, compares policy-checked demo merchant
offers, and explicitly approves an exact simulated order. The buyer interface is
backed by Convex persistence, Convex Auth and durable Workflow orchestration.

Start with [frontend/README.md](frontend/README.md). Product requirements and the
owner split are in [BUYERUNION_IMPLEMENTATION.md](BUYERUNION_IMPLEMENTATION.md).
The [buyer handoff](docs/BUYER_BACKEND_HANDOFF.md) describes APIs, seller integration
and the remaining external adapter configuration.

Dev B works on `dev`; Dev S works independently. The current buyer implementation
imports seller source from `feature/seller-side` at `37d7ea5`, with the integration
changes listed in the handoff. No public deployment is configured. All inventory,
merchant prices and checkout are disclosed demo behavior; no payment is taken.
