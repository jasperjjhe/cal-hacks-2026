# Converge

Converge is agent-negotiated shopping. A buyer confirms a private shopping brief, merchant agents bid and challenge each other in a moderated council, each submits one sealed final offer, and the buyer compares checked evidence before approving an exact test-mode order. Built at Cal Hacks 13.0.

## How we use Convex

- **Backend:** schema, queries, mutations, actions, crons and scheduled functions in [`frontend/convex`](https://github.com/jasperjjhe/cal-hacks-2026/tree/dev/frontend/convex).
- **Durable runs:** each shopping run is a `@convex-dev/workflow` workflow that survives restarts and retries.
- **Auth:** Convex Auth with guest (Anonymous) and Password sign-in.
- **Realtime:** run progress, offers, evidence, checkout and orders update live through `useQuery`.
- **Details:** see [hackathon.md](hackathon.md) for the file-by-file evidence and build log.

## Branches

- `main`: release docs (this README, the license, the hackathon log).
- [`dev`](https://github.com/jasperjjhe/cal-hacks-2026/tree/dev): the full application, including the Convex backend (`frontend/convex`), the React frontend (`frontend/src`) and the Fetch.ai seller agent (`agents/fetch-seller`).

## Stack

- **Convex:** database, auth, workflows and scheduled jobs.
- **Fetch.ai:** a hosted seller agent on Agentverse.
- **CREAO:** buyer intake and council moderation agents.
- **Apify:** review evidence from the web and Reddit.
- **Stripe:** checkout, in test mode only.

Merchants, inventory and prices are fictional demo data, and no real payment is ever taken.

## Run locally

On the `dev` branch, follow [`frontend/README.md`](https://github.com/jasperjjhe/cal-hacks-2026/blob/dev/frontend/README.md). It needs Node 24 and your own Convex deployment. Never commit keys or deployment secrets.

## License

Copyright (c) 2026 the Converge contributors. All rights reserved. This source is public so it can be viewed and judged; it is not open source. See [LICENSE](LICENSE).
