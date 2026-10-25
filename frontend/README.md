# BuyerUnion seller side

This package contains the Vite frontend and the seller-owned Convex backend for BuyerUnion. The active backend contract is the repository-level [`BUYERUNION_IMPLEMENTATION.md`](../BUYERUNION_IMPLEMENTATION.md); the seller implementation plan and sponsor evidence ledger are in [`docs/SELLER_IMPLEMENTATION_PLAN.md`](../docs/SELLER_IMPLEMENTATION_PLAN.md) and [`docs/SELLER_SPONSOR_PROOF.md`](../docs/SELLER_SPONSOR_PROOF.md).

The seller side owns merchant membership, catalog/profile data, immutable listing and pricing-policy versions, deterministic eligibility/fit/price validation, proposal persistence, inventory transition helpers and the provider-neutral Fetch.ai/CREAO seam. It does not own buyer prompts, private maximums, buyer runs, evidence, checkout or payment authority.

## Local checks

Use Node `24.18.x` and npm `11.16.x` from `.nvmrc` and `package.json`.

```powershell
npm ci --ignore-scripts
npm run test:security
npm run test:seller
npm run typecheck:seller
npm run security
npm run lint
npm run build
```

The dependency policy requires the committed lockfile, npmjs-only HTTPS tarballs, SHA-512 integrity, a seven-day minimum release age, signature/audit checks and disabled lifecycle scripts. Do not use `npm install` in CI. Never add `.env`, `.env.local`, deploy keys, provider tokens, wallet material or raw buyer/merchant payloads to source control.

## Convex handoff

The backend source is under `convex/`. This branch is now linked to the team's Convex development deployment. Run `npx convex dev` or `npx convex dev --once` from this directory to push changes and regenerate the checked-in `convex/_generated/` bindings. The deployment URL is written to ignored `.env.local`; never commit that file, deploy keys or provider credentials.

The production deployment and Auth provider still require team configuration. After Auth and production settings are ready, use `npx convex deploy` from a protected environment. The development deployment and fixture seed are smoke-test evidence, not by themselves judge-facing production sponsor proof.

## Provider handoff

`convex/integrations/fixtureAgentPort.ts` is deterministic CI/demo behavior. `fetchAdapter.ts` and `creaoAdapter.ts` require explicit HTTPS start/poll/cancel URLs, optional application-job reconciliation, host allowlists, a provider config revision, a server-side token callback and an input resolver. The internal `sellerAgent` action claims a scoped job, invokes the configured provider, polls pending runs, preserves ambiguous starts and sends terminal output to seller validation. The adapters do not invent agent IDs or endpoints. A provider result is only accepted after the buyer-owned workflow supplies the scoped job, the seller validator checks the output and the stored provider run is reconciled.

See [`docs/SELLER_FETCH_CONFIGURATION.md`](../docs/SELLER_FETCH_CONFIGURATION.md) for the exact Convex environment variables and [`docs/BUYER_SELLER_INTEGRATION_NOTES.md`](../docs/BUYER_SELLER_INTEGRATION_NOTES.md) for the buyer-branch handoff. No provider credential or live sponsor run is present in this repository.

The current Vite UI remains a scaffold while the buyer-side contributor and UI work proceed against the versioned seller contract.
