# BuyerUnion security rules

This project processes buyer requirements, merchant offers, web evidence, AI-agent outputs and optional payment-provider state. The rules below are release gates, not suggestions.

## Supply-chain and CI rules

1. Keep `frontend/package-lock.json` committed and use `npm ci`; do not use an unreviewed `npm install` in CI or deployment.
2. Consume packages only from `https://registry.npmjs.org/`, with a lockfile `sha512` integrity value. Git, URL, local-path and unpublished tarball dependencies require an explicit security review and are rejected by the dependency check.
3. Enforce the seven-day release-age window in both `frontend/.npmrc` (`min-release-age=7`) and `frontend/scripts/check-dependencies.mjs`. The locked version must have been published at least seven full days before CI can install it. The offline diagnostic mode is never a CI or deployment mode.
4. Treat dependency lifecycle scripts as untrusted code. `npm ci --ignore-scripts` is mandatory. Reviewed metadata exceptions are the exact optional `fsevents@2.3.3` entry and Convex's `esbuild@0.27.0` compiler entry in `security/allowed-install-scripts.json`. Scripts remain disabled even for these packages. The compiler uses its lockfile-installed platform binary; installer download fallbacks must not run. Changing the allowlist requires review.
5. Run the emergency compromised-version blocklist, npm signature/provenance verification, `npm audit --audit-level=high`, dependency review, and SBOM generation on every protected-branch change.
6. Pin every third-party GitHub Action to a full commit SHA. Workflows declare least-privilege `permissions`, use `persist-credentials: false`, disable dependency caching in security jobs, avoid `pull_request_target`/`workflow_run` for untrusted code, and do not pipe downloaded content into a shell.
7. Enable GitHub secret scanning, push protection, Dependabot security updates, and branch protection. Review workflow files as privileged code. Never place secrets in PR-triggered jobs.
8. Prefer GitHub-hosted ephemeral runners. Never run untrusted pull-request code on a persistent self-hosted runner.

## Shai-Hulud-style incident rules

If a package, workflow, developer machine or CI runner may have been exposed:

1. Stop builds, deployments, package publishing and wallet activity from the affected environment. Do not run another install to “repair” it.
2. Preserve the lockfile and logs, then inspect the dependency tree, npm cache, recent workflow changes, new repositories, webhooks, OAuth apps, and package-publish events.
3. Revoke and rotate potentially exposed npm tokens, GitHub tokens/apps, SSH keys, cloud credentials, Convex deploy keys, Mana credentials, provider API keys and Coinbase credentials. Treat any wallet signer used by the environment as compromised; use a new bounded test wallet.
4. Check for suspicious workflow files and outbound traffic, including the indicators named by current government advisories such as `webhook.site`, `npm-cache.com`, `pypi-get.com`, and `js-mirror.com`. Confirm the current advisory before relying on any IOC list.
5. Rebuild from a clean checkout and a clean runner using the seven-day policy, exact lockfile, signature checks, audit results and a reviewed SBOM. Do not restore a possibly tainted npm cache.
6. Record scope, timestamps, package versions, credentials rotated, and external notifications. A successful build is not evidence that a previous environment was clean.

## Application, agent and data rules

- Convex is the authoritative state store. Every query and mutation derives identity from authenticated context, checks ownership/membership, validates arguments, and returns an allowlisted safe projection. A client-supplied owner, role, merchant ID or record ID is never authorization.
- Keep browser variables public-only. Convex, Fetch.ai, CREAO, Apify, Cartesia, CRS, Coinbase/x402 and Mana credentials stay server-side. Do not put raw buyer prompts, private budgets, provider tokens, wallet seeds or agent secrets in logs, fixtures, screenshots or model context that does not need them.
- Treat model output, crawled pages, callbacks and webhook payloads as hostile input. Use strict schemas, bounded strings/arrays, canonical IDs, source allowlists, SSRF/private-network blocking, redirect revalidation, timeouts, retry caps and egress allowlists.
- Agent tools are capability-scoped per job. No agent may select an arbitrary merchant, browse an arbitrary URL, alter an authoritative price/stock/policy, approve a purchase, or call a generic “complete any job” endpoint. Every side effect requires a server-owned job scope, idempotency key and an auditable result.
- Never expose hidden chain-of-thought. Show validated plans, tool calls, sources, safe summaries, diffs and outcomes only.
- Apply consent and data minimization to shared targets, voice recordings, identity/credit signals and evidence. Retain only the minimum necessary data; use test identities for CRS and synthetic fixtures for fictional products.
- Visa checkout remains simulation-first. A Visa sandbox action must be tied to the stored quote, merchant mapping, quote hash and idempotent attempt. Tokenization is not payment. An unknown external state blocks a new attempt until reconciled.
- Coinbase/x402 is a separate machine-to-machine evidence-access capability. Enforce server-side per-request and aggregate budgets, fixed token/network/destination allowlists, a bounded test wallet, one payment attempt and reconciliation. Never put a signer in the browser, automatically fund a wallet, or describe an x402 evidence payment as a Visa purchase.
- Rate-limit buyer actions, agent cycles, crawler jobs, callback retries and paid requests. Fail closed on missing identity, stale versions, invalid provenance, unknown payment state or unavailable mandatory evidence.

## Review and release checklist

Before merging or demo deployment, verify:

- `npm run security` and the full CI workflow pass from a clean checkout;
- no new package, Action, URL dependency, lifecycle script, secret, workflow privilege or external egress was added without review;
- live Fetch/CREAO, Convex, Apify, Coinbase/x402, Visa and Mana claims are backed by a working run and README evidence;
- simulation, sandbox and production-like modes are visibly distinct; and
- the demo can be rebuilt from the checked-in lockfile without access to developer credentials.

Report suspected vulnerabilities privately to the repository maintainers. Do not publish secrets, exploit details or compromised package contents in an issue.
