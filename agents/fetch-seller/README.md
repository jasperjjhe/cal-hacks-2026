# Converge Fetch seller agent

This is the seller-side Fetch.ai uAgent. It performs the seller's bounded
catalog matching and v5.3 council work and returns canonical outputs that the
Convex backend validates again. It never receives the buyer's raw conversation,
requirement origins, private maximum, arbitrary rival records, seller cost,
contribution or discount-cap inputs, or sealed final terms. For a sealed final
invitation it also receives its own merchant's price authority: the lowest unit
price that merchant's policy allows for each frozen line, derived by Convex (see
"Final pricing strategy"). That value equals the operator floor whenever the
floor is the binding limit, so the merchant's own walk-away price does cross to
its own agent, as spec §4/§5.6 allow ("its own inventory/policy"). Council roles receive only the
canonical immutable public competition snapshot and checked outcome
references; the worker cannot adjudicate or publish buyer results.

## Transport notes (verified live 2026-10-25)

- The gateway signs a sync envelope with its own `agent1…` identity and posts it
  to `https://agentverse.ai/v1/hosting/submit`. Agentverse answers hosted sync
  queries from agent identities; `uagents.query`'s throwaway `user1…` senders
  get HTTP 500. Replies are accepted only when signed by the configured agent
  for the same session.
- Agentverse's edge rejects urllib's default User-Agent (Cloudflare 1010), so the
  gateway sends its own.
- Seller jobs complete on the start call (one round trip). The spec bounds seller
  council and final jobs at 30 s and the buyer polls every 15 s, so an extra pending
  step would always miss the window. Replays, polls and cancels return the stored result.
- Hosted round trips measured 2–20 s; keep `FETCH_SELLER_REQUEST_TIMEOUT_MS` at
  25000 in Convex.
- Hosted modules can lack `__file__`; `seller_schema_data.py` (generated) carries
  the same schema as `seller.schema.json`.
- `protocol.py` must not use postponed annotations: the hosted runtime otherwise
  fails every envelope with a pydantic ForwardRef ConfigError.
- The agent also publishes the Agent Chat Protocol as a read-only description
  of its role. Chat never starts or changes a seller job.

## Agentverse deployment

The checked-in `.avctl/config.toml` points at the existing Agentverse Hosted
Agent. The Git repository is the source of truth; deploy from this directory
after review with:

```text
avctl auth status
avctl hosting deploy -f agent.py,protocol.py,seller_logic.py,seller_schema_data.py,seller.schema.json
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
FETCH_SELLER_SHARED_TOKEN=<gateway-to-agent secret, also the hosted Agent Secret>
FETCH_SELLER_GATEWAY_SEED=<random seed for the gateway's own agent identity>
FETCH_SELLER_GATEWAY_IDENTITIES=16   # optional; parallel queries to the hosted agent
FETCH_SELLER_QUERY_TIMEOUT_SECONDS=22
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

## v5.3 council roles

The active specification adds seller advocacy, grouped replies and one sealed
final invitation per eligible candidate. The worker accepts those canonical v2
roles in addition to the legacy opening proposal path. `seller.schema.json` is
a generated deployment copy of `frontend/convex/lib/seller.schema.json`, which
is emitted from the buyer-owned `frontend/src/contracts/index.ts` registry.
Regenerate both artifacts from that registry before changing a council
contract; do not hand-edit the Python schema copy.

The worker defends its frozen candidates and emits at most one scoped peer
challenge, answers one grouped batch of admitted challenges, or submits one
parent-bound hold/abstention/final revision per invited candidate.
It must not adjudicate, rank or remove rivals, browse for new seller facts,
change the common snapshot, reopen bargaining or expose sealed submissions.
The Python parser and fixtures must be derived from the canonical shared
contract source; do not create a second handwritten council schema here.

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

## Final pricing strategy

The sealed final round is one shot per candidate, so the strategy must not
drift toward the floor. It uses only public competition data, the buyer's
consented shared target (never the private maximum, which no seller job
receives) and the merchant's own price authority:

1. **No authority, no price change.** Without a valid `sellerAuthority` the
   worker holds. The authority must match the frozen offer exactly (job,
   candidate, offer, lines, quantities, unit prices summing to the total) and
   carries one number per line, `lowestAuthorizedUnitCents` = max(operator
   floor, discount bound, unit cost + minimum contribution). No separate cost,
   cap or contribution fields are sent, but the value equals whichever term
   binds, so it can reveal the merchant's own floor or cost-plus-contribution
   basis to that merchant's own agent (permitted by spec §4: a seller job holds
   only its own policy). It never reaches the buyer or another merchant.
2. **Concede only against concrete pressure.** A *comparable rival* is another
   merchant's snapshot offer for the same request lines whose checked soft-fit
   coverage is at least this offer's (computed like the backend's
   `weightedCoverage`: unknown checks leave the denominator). If one is no more expensive, the target is
   that rival's total minus the smallest meaningful step (0.5%, at least $1).
3. **Do not chase what cannot be won.** If beating the rival would take the
   offer below its authorized lowest total, the merchant holds and competes on
   its non-price advantages instead of giving margin away.
4. **A buyer target cannot ratchet the price down.** A consented shared target
   is met (or beaten by less than one cent per unit, from integer rounding)
   only when it needs at most half of the merchant's room
   (current total minus authorized lowest total); a deeper target is ignored.
5. **Already competitive means hold.** No pressure, or a target at or above the
   current total, produces a hold. Holding is valid and carries no penalty.
6. The concession is spread across lines in proportion to each line's room,
   never below a line's authorized lowest price or above its current price.
   Goods, quantities and service terms stay frozen; `serviceOptionId` is null.

Convex derives the authority at dispatch with the same `minimumUnitCents` rule
`validateFinalOfferRevision` enforces, sends it beside (not inside) the
canonical `SellerFinalJobInput`, and never stores it with buyer or seller job
inputs. Each final job carries only its own merchant's authority; in the demo one
hosted agent serves all three fictional merchants, so isolation is per job, not
per agent deployment. Convex still revalidates every revision; an authority-respecting
proposal is accepted rather than rejected for price.

**Deterministic, not LLM-prompted.** The final decision is numeric and must
satisfy exact integer constraints inside a 30-second job whose hosted round
trip already takes 2–20 s. A rule-based strategy is reproducible, testable and
cannot be steered by untrusted text in the snapshot (rival claims and source
excerpts). Spec §1 requires a model only where the agent interprets language;
these inputs are structured, and the backend replaces seller prose with checked
wording anyway. A language model could later draft advocacy text or explain a
decision to the merchant, but it should not set prices.

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
- Reusing a job ID for the same role with a different input digest or price
  authority is rejected. Convex reuses a candidate's opening job ID for its
  sealed final, so a start for a different role replaces the earlier record.
- Storage records contain only bounded state and the validated decision; they do
  not contain the token or the full request envelope.
- Input fields are allowlisted and recursively scanned for private buyer/seller
  fields before matching. The v5.3 common snapshot, when enabled, is an
  explicit public projection rather than an unrestricted competitor record.
- Catalog matching fails closed for unknown hard facts, wrong units, wrong
  category/profile, disallowed condition, insufficient stock, and malformed
  policy/catalog data.
- The agent opens at the public reference price and revises a final only
  inside its merchant's own authorized lowest prices. Convex recomputes
  floors, contribution, stock, shipping, and buyer-visible totals.
- This agent does not authorize checkout, reserve inventory, transfer money, or
  become the source of truth for offers.

The Fetch sponsor claim remains pending until the team records an actual
Agentverse URL, non-secret provider run ID, pending-to-terminal transition,
accepted proposal, and malformed/timeout recovery in
`docs/SELLER_SPONSOR_PROOF.md`.

## Gateway concurrency

Agentverse's hosted submit endpoint fails overlapping sync queries from one sender:
with two or more in flight it returns 500s or times out, while queries from distinct
senders run in parallel. A buyer run opens about ten seller jobs at once, so the
gateway leases a separate identity per in-flight query, all derived from
`FETCH_SELLER_GATEWAY_SEED` (index 0 is the original identity). The pool size is
`FETCH_SELLER_GATEWAY_IDENTITIES` (default 16, max 64). If every identity is busy
for the full query timeout, the job fails with a retryable `PROVIDER_TIMEOUT`.

Convex keeps the gateway's error code and retry flag: `PROVIDER_TIMEOUT` and
`PROVIDER_UNAVAILABLE` are retried within the seller attempt budget (by polling,
which recovers a slow start the agent did receive), and agent decisions such as
`INVALID_INPUT` stay non-retryable rejections.
