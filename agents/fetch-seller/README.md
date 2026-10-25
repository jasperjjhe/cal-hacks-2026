# BuyerUnion Fetch seller agent

This is the seller-side Fetch.ai uAgent. It performs the seller's bounded
catalog matching work and returns a `SellerDecision` that the Convex backend
validates again. It never receives the buyer's raw conversation, requirement
origins, private maximum, competitor data, seller cost, or operator floor.

## Agentverse deployment

Create a Hosted Agent in Agentverse and copy the files in this directory into
the hosted code editor. Hosted Agents reset process globals between invocations,
so this implementation stores job state with `ctx.storage`.

Agentverse hosting and direct REST reachability are separate checks. The
Agentverse control-plane address is not automatically a substitute for the
`FETCH_SELLER_*_URL` values. Confirm that the dashboard exposes a public HTTPS
base URL for these custom REST routes before configuring Convex. If it does
not, run the same source on the team's public Mana endpoint, set
`FETCH_SELLER_AGENT_ENDPOINT` and `FETCH_SELLER_AGENT_MAILBOX=true`, and use
that exact HTTPS host for Convex while Agentverse provides discovery/mailbox
connectivity.

Configure `FETCH_SELLER_SHARED_TOKEN` as an Agent Secret. The value must be a
long random token shared only with the Convex deployment's
`FETCH_SELLER_AGENT_TOKEN` environment variable. The agent fails closed if the
secret is missing or does not match. Do not put the value in this repository,
the agent profile, or a demo recording.

The routes are fixed, typed POST endpoints:

| Operation | Route | Purpose |
|---|---|---|
| Start | `/seller/jobs` | Idempotently create a pending seller run |
| Poll | `/seller/jobs/poll` | Advance a known run by application job ID |
| Reconcile | `/seller/jobs/reconcile` | Recover an accepted/ambiguous run by job ID |
| Cancel | `/seller/jobs/cancel` | Best-effort cancellation |

The Convex environment should point every URL at the exact HTTPS host exposed
by the deployed agent:

```text
FETCH_SELLER_START_URL=https://<verified-agent-host>/seller/jobs
FETCH_SELLER_POLL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/poll
FETCH_SELLER_RECONCILE_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/reconcile
FETCH_SELLER_CANCEL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/cancel
FETCH_SELLER_ALLOWED_HOSTS=<verified-agent-host>
FETCH_SELLER_REQUEST_TIMEOUT_MS=8000
FETCH_SELLER_CONFIG_REVISION=fetch-seller-agentverse-v1
FETCH_SELLER_AGENT_TOKEN=<same secret value, entered only with `npx convex env set`>
```

The Convex adapter sends the token as a bearer header and, for these Fetch
routes, as `providerAuthToken` inside the POST envelope because the uAgents REST
handler receives a typed request model. The token is not logged or persisted by
the agent.

## Local smoke test

The pure seller logic has no third-party dependency:

```text
python agents/fetch-seller/test_seller_logic.py
```

To run the uAgent locally, use an isolated Python 3.10–3.13 environment and
install a vetted, exact uAgents version only after the repository's seven-day
release-age check and signature/provenance review. Do not use an unbounded
`pip install -U`. Set `FETCH_SELLER_SHARED_TOKEN`, a local port, and a local
seed through the environment before running `python agent.py`.

## Security boundaries

- Requests are authenticated with a shared secret and bound to the job ID,
  run ID, phase ID, role, and input digest.
- Reusing a job ID with a different digest is rejected.
- Storage records contain only bounded state and the validated decision; they do
  not contain the token or the full request envelope.
- Input fields are allowlisted and recursively scanned for private buyer/seller
  fields before matching.
- Catalog matching fails closed for unknown hard facts, wrong units, wrong
  category/profile, disallowed condition, insufficient stock, and malformed
  policy/catalog data.
- The agent proposes only a public reference price. Convex recomputes hidden
  floors, contribution, stock, shipping, and buyer-visible totals.
- This agent does not authorize checkout, reserve inventory, transfer money, or
  become the source of truth for offers.

The Fetch sponsor claim remains pending until the team records an actual
Agentverse URL, non-secret provider run ID, pending-to-terminal transition,
accepted proposal, and malformed/timeout recovery in
`docs/SELLER_SPONSOR_PROOF.md`.

