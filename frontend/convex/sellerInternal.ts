import { internalMutationGeneric, internalQueryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  assertSellerBriefSafe,
  parseSellerDecision,
  safeReason,
  type CatalogSnapshot,
  type PricingPolicy,
  type SellerBrief,
  type SellerProposal,
} from './lib/sellerContracts.ts'
import { validateSellerProposal } from './lib/sellerValidation.ts'
import {
  payloadDigest,
  requireMerchant,
  throwSellerError,
  type SellerMutationCtx,
  type SellerQueryCtx,
} from './sellerAuth.ts'

const refValidator = v.object({ id: v.string(), version: v.number() })

type Provider = 'fixture' | 'fetch' | 'creao'
type SellerRole = 'seller_initial' | 'seller_response' | 'seller_final'
type OfferMode = 'fixture' | 'live' | 'cached' | 'simulation' | 'visa_sandbox'

interface PrepareSellerJobArgs {
  jobId: string
  requestId: string
  requestVersion: number
  runId: string
  phaseId: string
  merchantId: string
  candidateIds: string[]
  policy: { id: string; version: number }
  profileVersions: Record<string, number>
  role: SellerRole
  provider: Provider
  providerConfigRevision: string
  inputDigest: string
  inputRef: string
  deadlineAt: number
}

interface ValidateProposalArgs {
  jobId: string
  brief: unknown
  decision: unknown
  mode?: OfferMode
}

function requireBoundedString(value: string, field: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throwSellerError('INVALID_INPUT', `${field} is invalid`, field)
}

function requirePositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1) throwSellerError('INVALID_INPUT', `${field} is invalid`, field)
}

function providerToMode(provider: Provider): OfferMode {
  return provider === 'fixture' ? 'fixture' : 'live'
}

export async function getPolicy(ctx: SellerQueryCtx | SellerMutationCtx, reference: { id: string; version: number }) {
  const policies = await ctx.db
    .query('policyVersions')
    .withIndex('by_policyId_and_version', (query) => query.eq('policyId', reference.id).eq('version', reference.version))
    .collect()
  if (policies.length !== 1) throwSellerError('POLICY_VERSION_STALE', 'seller job policy version was not found')
  return policies[0]
}

export function toPolicy(document: {
  policyId: string
  merchantId: string
  version: number
  enabled: boolean
  maxDiscountBps: number
  unitCostByListing: Record<string, number>
  minimumContributionByListing: Record<string, number>
  costsAreSynthetic: boolean
  shippingCents: number
  arrivalCalendarDays: number
  warrantyMonths: number
  returnDays: number
}): PricingPolicy {
  return {
    policy: { id: document.policyId, version: document.version },
    merchantId: document.merchantId,
    enabled: document.enabled,
    maxDiscountBps: document.maxDiscountBps,
    unitCostByListing: { ...document.unitCostByListing },
    minimumContributionByListing: { ...document.minimumContributionByListing },
    costsAreSynthetic: document.costsAreSynthetic,
    shippingCents: document.shippingCents,
    arrivalCalendarDays: document.arrivalCalendarDays,
    warrantyMonths: document.warrantyMonths,
    returnDays: document.returnDays,
  }
}

export async function loadSnapshots(ctx: SellerQueryCtx | SellerMutationCtx, merchantId: string): Promise<CatalogSnapshot[]> {
  const listings = await ctx.db
    .query('listingVersions')
    .withIndex('by_merchantId_and_enabled', (query) => query.eq('merchantId', merchantId).eq('enabled', true))
    .collect()
  const snapshots: CatalogSnapshot[] = []
  for (const listing of listings) {
    const variants = await ctx.db
      .query('variants')
      .withIndex('by_variantId', (query) => query.eq('variantId', listing.variantId))
      .collect()
    if (variants.length !== 1) continue
    const variant = variants[0]
    let availableQuantity = listing.initialQuantity
    const allocations = []
    for (const state of ['reserved', 'execution_locked', 'sold'] as const) {
      const stateAllocations = await ctx.db
        .query('allocations')
        .withIndex('by_listingId_and_state', (query) => query.eq('listingId', listing.listingId).eq('state', state))
        .collect()
      allocations.push(...stateAllocations)
    }
    availableQuantity -= allocations.filter(allocation => allocation.state !== 'reserved' || allocation.expiresAt > Date.now()).reduce((sum, allocation) => sum + allocation.quantity, 0)
    snapshots.push({
      variant: {
        id: variant.variantId,
        productId: variant.productId,
        title: variant.title,
        category: variant.category,
        profile: variant.profile,
        manufacturerPartNumber: variant.manufacturerPartNumber,
        attributes: variant.attributes,
        syntheticProduct: variant.syntheticProduct,
      },
      listing: {
        listing: { id: listing.listingId, version: listing.version },
        merchantId: listing.merchantId,
        variantId: listing.variantId,
        condition: listing.condition,
        unitId: listing.unitId,
        initialQuantity: listing.initialQuantity,
        referenceUnitCents: listing.referenceUnitCents,
        operatorFloorCents: listing.operatorFloorCents,
        diagnosticAttributes: listing.diagnosticAttributes,
      },
      availableQuantity: Math.max(0, availableQuantity),
    })
  }
  return snapshots
}

async function recordInternalEvent(
  ctx: SellerMutationCtx,
  merchantId: string,
  eventType: 'proposal_received' | 'proposal_rejected' | 'offer_accepted',
  payload: unknown,
  reasons: Array<{ code: string; field: string | null; message: string }> = [],
  jobId: string | null = null,
  candidateId: string | null = null,
  offerId: string | null = null,
) {
  await ctx.db.insert('sellerEvents', {
    merchantId,
    eventType,
    jobId,
    candidateId,
    offerId,
    safeReasons: reasons,
    payloadDigest: await payloadDigest(payload),
    createdAt: Date.now(),
  })
}

export const getMerchantSnapshot = internalQueryGeneric({
  args: { merchantId: v.string() },
  handler: async (ctx: SellerQueryCtx, args: { merchantId: string }) => {
    const merchant = await requireMerchant(ctx, args.merchantId)
    const listings = await loadSnapshots(ctx, args.merchantId)
    const policyReference = merchant.currentPolicyId
      ? { id: merchant.currentPolicyId, version: merchant.currentPolicyVersion }
      : null
    const policy = policyReference ? toPolicy(await getPolicy(ctx, policyReference)) : null
    return {
      merchant: {
        merchantId: merchant.merchantId,
        displayName: merchant.displayName,
        enabled: merchant.enabled,
        paused: merchant.paused,
      },
      listings,
      policy,
    }
  },
})

export const prepareSellerJob = internalMutationGeneric({
  args: {
    jobId: v.string(),
    requestId: v.string(),
    requestVersion: v.number(),
    runId: v.string(),
    phaseId: v.string(),
    merchantId: v.string(),
    candidateIds: v.array(v.string()),
    policy: refValidator,
    profileVersions: v.record(v.string(), v.number()),
    role: v.union(v.literal('seller_initial'), v.literal('seller_response'), v.literal('seller_final')),
    provider: v.union(v.literal('fixture'), v.literal('fetch'), v.literal('creao')),
    providerConfigRevision: v.string(),
    inputDigest: v.string(),
    inputRef: v.string(),
    deadlineAt: v.number(),
  },
  handler: async (ctx: SellerMutationCtx, args: PrepareSellerJobArgs) => {
    for (const [field, value] of Object.entries({
      jobId: args.jobId,
      requestId: args.requestId,
      runId: args.runId,
      phaseId: args.phaseId,
      merchantId: args.merchantId,
      providerConfigRevision: args.providerConfigRevision,
      inputDigest: args.inputDigest,
      inputRef: args.inputRef,
    })) requireBoundedString(value, field)
    if (args.candidateIds.length === 0 || args.candidateIds.length > 2) throwSellerError('INVALID_INPUT', 'seller jobs must have one or two candidates', 'candidateIds')
    args.candidateIds.forEach((candidateId) => requireBoundedString(candidateId, 'candidateId'))
    requirePositiveInteger(args.requestVersion, 'requestVersion')
    if (!Number.isSafeInteger(args.deadlineAt) || args.deadlineAt <= Date.now() || args.deadlineAt > Date.now() + 210_000) {
      throwSellerError('INVALID_INPUT', 'seller job deadline is outside the bounded workflow window', 'deadlineAt')
    }
    const merchant = await requireMerchant(ctx, args.merchantId)
    if (!merchant.enabled || merchant.paused) throwSellerError('MERCHANT_PAUSED', 'merchant is not eligible for new seller jobs')
    const policy = await getPolicy(ctx, args.policy)
    if (policy.merchantId !== args.merchantId || !policy.enabled) throwSellerError('POLICY_DISABLED', 'seller policy is not enabled')
    const existing = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (existing.length > 0) {
      const prior = existing[0]
      const same = prior.merchantId === args.merchantId && prior.inputDigest === args.inputDigest && prior.inputRef === args.inputRef && prior.phaseId === args.phaseId
      if (!same) throwSellerError('REPLAY_REJECTED', 'job ID was already prepared with a different payload')
      return { jobId: prior.jobId, status: prior.status, replayed: true }
    }
    await ctx.db.insert('sellerJobs', {
      jobId: args.jobId,
      requestId: args.requestId,
      requestVersion: args.requestVersion,
      runId: args.runId,
      phaseId: args.phaseId,
      merchantId: args.merchantId,
      candidateIds: [...args.candidateIds],
      policyId: args.policy.id,
      policyVersion: args.policy.version,
      profileVersions: { ...args.profileVersions },
      role: args.role,
      provider: args.provider,
      providerConfigRevision: args.providerConfigRevision,
      inputDigest: args.inputDigest,
      inputRef: args.inputRef,
      deadlineAt: args.deadlineAt,
      status: 'created',
      providerRunId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    for (const candidateId of args.candidateIds) {
      const candidates = await ctx.db
        .query('candidates')
        .withIndex('by_candidateId', (query) => query.eq('candidateId', candidateId))
        .collect()
      if (candidates.length > 0 && candidates[0].merchantId !== args.merchantId) throwSellerError('WRONG_MERCHANT_SCOPE', 'candidate belongs to another merchant')
      if (candidates.length > 0 && candidates[0].jobId !== args.jobId) throwSellerError('REPLAY_REJECTED', 'candidate is already bound to another seller job')
      if (candidates.length === 0) {
        await ctx.db.insert('candidates', {
          candidateId,
          jobId: args.jobId,
          merchantId: args.merchantId,
          status: 'open',
          currentOfferId: null,
          currentOfferVersion: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    }
    return { jobId: args.jobId, status: 'created' as const, replayed: false }
  },
})

export const validateAndStoreProposal = internalMutationGeneric({
  args: { jobId: v.string(), brief: v.any(), decision: v.any(), mode: v.optional(v.union(v.literal('fixture'), v.literal('live'), v.literal('cached'), v.literal('simulation'), v.literal('visa_sandbox'))) },
  handler: async (ctx: SellerMutationCtx, args: ValidateProposalArgs) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'seller job was not found')
    const job = jobs[0]
    if (job.status === 'cancelled' || job.status === 'stale' || Date.now() > job.deadlineAt) {
      if (job.status !== 'stale') await ctx.db.patch(job._id, { status: 'stale', updatedAt: Date.now() })
      return { ok: false as const, outcome: 'late', reasons: [safeReason('LATE_COMPLETION', 'seller completion arrived after the job deadline')] }
    }
    assertSellerBriefSafe(args.brief)
    const decision = parseSellerDecision(args.decision)
    if ('jobId' in decision && decision.jobId !== job.jobId) {
      return { ok: false as const, outcome: 'rejected', reasons: [safeReason('WRONG_JOB_SCOPE', 'provider result references another job', 'jobId')] }
    }
    await recordInternalEvent(ctx, job.merchantId, 'proposal_received', { jobId: job.jobId, decisionKind: decision.kind }, [], job.jobId, decision.kind === 'propose' ? decision.proposal.candidateId : null)
    if (decision.kind === 'abstain') {
      const candidate = await findCandidate(ctx, job.jobId, decision.jobId, job.merchantId)
      if (candidate) await ctx.db.patch(candidate._id, { status: 'abstained', updatedAt: Date.now() })
      await ctx.db.patch(job._id, { status: 'completed', updatedAt: Date.now() })
      return { ok: true as const, outcome: 'abstain', reasons: [] }
    }
    if (decision.kind === 'hold') {
      const candidate = await findCandidateByOffer(ctx, job.jobId, decision.offer.id, job.merchantId)
      if (!candidate) return { ok: false as const, outcome: 'rejected', reasons: [safeReason('WRONG_JOB_SCOPE', 'hold references an unknown candidate or offer')] }
      await ctx.db.patch(candidate._id, { status: 'held', updatedAt: Date.now() })
      await ctx.db.patch(job._id, { status: 'completed', updatedAt: Date.now() })
      return { ok: true as const, outcome: 'hold', offer: decision.offer, reasons: [] }
    }
    const proposal = decision.proposal
    const policyDocument = await getPolicy(ctx, { id: job.policyId, version: job.policyVersion })
    const context = {
      jobId: job.jobId,
      merchantId: job.merchantId,
      brief: args.brief as SellerBrief,
      policy: toPolicy(policyDocument),
      candidates: job.candidateIds,
      catalog: await loadSnapshots(ctx, job.merchantId),
      now: Date.now(),
      mode: args.mode ?? providerToMode(job.provider),
    }
    const validated = validateSellerProposal(context, proposal as SellerProposal)
    if (!validated.ok) {
      await recordInternalEvent(ctx, job.merchantId, 'proposal_rejected', { jobId: job.jobId, candidateId: proposal.candidateId }, validated.reasons, job.jobId, proposal.candidateId)
      return { ok: false as const, outcome: 'rejected', reasons: validated.reasons }
    }
    const priorOffers = await ctx.db
      .query('offerVersions')
      .withIndex('by_candidateId_and_version', (query) => query.eq('candidateId', proposal.candidateId))
      .collect()
    const version = priorOffers.reduce((maximum, offer) => Math.max(maximum, offer.version), 0) + 1
    const offerId = `${job.jobId}:${proposal.candidateId}`
    const offerRef = { id: offerId, version }
    await ctx.db.insert('offerVersions', {
      offerId,
      version,
      jobId: validated.offer.jobId,
      candidateId: validated.offer.candidateId,
      merchantId: validated.offer.merchantId,
      parentOffer: validated.offer.parentOffer,
      policy: validated.offer.policy,
      lines: validated.offer.lines,
      itemsCents: validated.offer.itemsCents,
      shippingCents: validated.offer.shippingCents,
      totalCents: validated.offer.totalCents,
      arrivalCalendarDays: validated.offer.arrivalCalendarDays,
      warrantyMonths: validated.offer.warrantyMonths,
      returnDays: validated.offer.returnDays,
      fit: validated.offer.fit,
      claims: validated.offer.claims,
      status: validated.offer.status,
      mode: validated.offer.mode,
      createdAt: validated.offer.createdAt,
    })
    const candidate = await findCandidate(ctx, job.jobId, proposal.candidateId, job.merchantId)
    if (candidate) {
      await ctx.db.patch(candidate._id, {
        status: 'accepted',
        currentOfferId: offerId,
        currentOfferVersion: version,
        updatedAt: Date.now(),
      })
    }
    await ctx.db.insert('fitAssessments', {
      offerId,
      offerVersion: version,
      merchantId: job.merchantId,
      assessment: validated.offer.fit,
      createdAt: Date.now(),
    })
    await ctx.db.patch(job._id, { status: 'completed', updatedAt: Date.now() })
    await recordInternalEvent(ctx, job.merchantId, 'offer_accepted', { offerId, version, totalCents: validated.offer.totalCents }, [], job.jobId, proposal.candidateId, offerId)
    return { ok: true as const, outcome: 'accepted', offer: offerRef, totalCents: validated.offer.totalCents, reasons: [] }
  },
})

async function findCandidate(ctx: SellerMutationCtx, jobId: string, candidateId: string, merchantId: string) {
  const candidates = await ctx.db
    .query('candidates')
    .withIndex('by_candidateId', (query) => query.eq('candidateId', candidateId))
    .collect()
  return candidates.find((candidate) => candidate.jobId === jobId && candidate.merchantId === merchantId) ?? null
}

async function findCandidateByOffer(ctx: SellerMutationCtx, jobId: string, offerId: string, merchantId: string) {
  const candidates = await ctx.db
    .query('candidates')
    .withIndex('by_jobId_and_merchantId', (query) => query.eq('jobId', jobId).eq('merchantId', merchantId))
    .collect()
  return candidates.find((candidate) => candidate.currentOfferId === offerId) ?? null
}
