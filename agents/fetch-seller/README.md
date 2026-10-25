# BuyerUnion Fetch seller agent

This is the seller-side Fetch.ai uAgent. It performs the seller's bounded
catalog matching work and returns a `SellerDecision` that the Convex backend
validates again. It never receives the buyer's raw conversation, requirement
origins, private maximum, competitor data, seller cost, or operator floor.

## Agentverse deployment

The checked-in `.avctl/config.toml` points at the existing Agentverse Hosted
Agent. The Git repository is the source of truth; deploy from this directory
after review with:

```text
avctl auth status
avctl hosting deploy -f agent.py,protocol.py,seller_logic.py
```

`hosting deploy` updates and restarts the configured Agentverse agent. Do not
use the hosted editor as an untracked source of truth. If a hosted-editor
change is made for an emergency, reconcile it back into Git immediately.
Hosted Agents reset process globals between invocations, so this implementation
stores job state with `ctx.storage`.

The hosted Agentverse runtime uses the typed `SellerMessage` query contract in
`protocol.py`. The current hosted wrapper does not expose `on_rest_post`, so
Convex must not use the Agentverse address as an HTTP URL. For the existing
Convex HTTP port, run `gateway.py` on the public Mana edge; it authenticates
Convex, forwards only the four fixed operations as a uAgents query to this
Agentverse address, and returns the validated provider response. The gateway
must be behind HTTPS and receives these runtime-only variables:

```text
FETCH_SELLER_AGENT_ADDRESS=<this Agentverse address>
FETCH_SELLER_GATEWAY_TOKEN=<Convex-to-gateway secret>
FETCH_SELLER_SHARED_TOKEN=<gateway-to-agent secret>
FETCH_SELLER_GATEWAY_HOST=127.0.0.1
FETCH_SELLER_GATEWAY_PORT=8787
```

`pyproject.toml` is checked in for reproducible local/Mana setup and pins the
Agentverse-supported `uagents==0.25.5`; Agentverse's hosted uploader accepts
the Python modules and manages its runtime package allowlist separately.

AVCTL device authentication is intentionally short-lived. The current CLI has
no documented flag to extend the device-token lifetime; run `avctl auth login`
again when it expires. If Agentverse provides an account/API token suitable for
automation, load it with `avctl auth token` only in a protected local or CI
secret store. Never commit it, put it in `.env`, or place it in deployment
metadata.

Set the shared runtime secret in Agentverse, not in source control:

```text
avctl hosting add secrets FETCH_SELLER_SHARED_TOKEN
```

The command prompts for the value. Use a new random secret shared only with
the Mana gateway's `FETCH_SELLER_SHARED_TOKEN` environment variable. The
Convex `FETCH_SELLER_AGENT_TOKEN` is a separate gateway secret matching
`FETCH_SELLER_GATEWAY_TOKEN`; it must not be reused as the Agentverse secret.
The agent fails closed if its shared secret is missing or does not match. Do
not put either value in this repository, the agent profile, or a demo
recording.

The routes are fixed, typed POST endpoints:

| Operation | Route | Purpose |
|---|---|---|
| Start | `/seller/jobs` | Idempotently create a pending seller run |
| Poll | `/seller/jobs/poll` | Advance a known run by application job ID |
| Reconcile | `/seller/jobs/reconcile` | Recover an accepted/ambiguous run by job ID |
| Cancel | `/seller/jobs/cancel` | Best-effort cancellation |

The Convex environment should point every URL at the exact HTTPS host exposed
by the deployed Mana gateway:

```text
FETCH_SELLER_START_URL=https://<verified-agent-host>/seller/jobs
FETCH_SELLER_POLL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/poll
FETCH_SELLER_RECONCILE_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/reconcile
FETCH_SELLER_CANCEL_URL_TEMPLATE=https://<verified-agent-host>/seller/jobs/cancel
FETCH_SELLER_ALLOWED_HOSTS=<verified-agent-host>
FETCH_SELLER_REQUEST_TIMEOUT_MS=8000
FETCH_SELLER_CONFIG_REVISION=fetch-seller-agentverse-gateway-v1
FETCH_SELLER_AGENT_TOKEN=<gateway secret, entered only with `npx convex env set`>
```

The Convex adapter sends the gateway token as a bearer header and POST field.
The gateway authenticates that token, discards the client-supplied provider
token, and injects the separately stored Agentverse shared secret into the
typed uAgents query. Neither token is logged or persisted by the agent.

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

