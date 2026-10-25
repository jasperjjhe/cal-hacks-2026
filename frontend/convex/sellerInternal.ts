import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

import {
  assertSellerBriefSafe,
  assertNoPrivateSellerFields,
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
  brief?: unknown
}

interface ValidateProposalArgs {
  jobId: string
  brief: unknown
  decision: unknown
  mode?: OfferMode
  providerRunId?: string | null
  providerModel?: string | null
  providerElapsedMs?: number | null
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

async function getPolicy(ctx: SellerQueryCtx | SellerMutationCtx, reference: { id: string; version: number }) {
  const policies = await ctx.db
    .query('policyVersions')
    .withIndex('by_policyId_and_version', (query) => query.eq('policyId', reference.id).eq('version', reference.version))
    .collect()
  if (policies.length !== 1) throwSellerError('POLICY_VERSION_STALE', 'seller job policy version was not found')
  return policies[0]
}

function toPolicy(document: {
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

async function loadSnapshots(ctx: SellerQueryCtx | SellerMutationCtx, merchantId: string): Promise<CatalogSnapshot[]> {
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
    availableQuantity -= allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
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
  eventType:
    | 'proposal_received'
    | 'proposal_rejected'
    | 'offer_accepted'
    | 'provider_started'
    | 'provider_pending'
    | 'provider_completed'
    | 'provider_failed'
    | 'provider_ambiguous'
    | 'provider_cancelled',
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

export const getMerchantSnapshot = internalQuery({
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

export const prepareSellerJob = internalMutation({
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
    brief: v.optional(v.any()),
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
      if (args.brief !== undefined && prior.status === 'created') {
        await storeSellerBrief(ctx, prior.jobId, args.brief, prior.requestId, prior.requestVersion, prior.runId)
      }
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
      providerModel: null,
      providerElapsedMs: null,
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorRetryable: null,
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
    if (args.brief !== undefined) {
      await storeSellerBrief(ctx, args.jobId, args.brief, args.requestId, args.requestVersion, args.runId)
    }
    return { jobId: args.jobId, status: 'created' as const, replayed: false }
  },
})

async function storeSellerBrief(
  ctx: SellerMutationCtx,
  jobId: string,
  value: unknown,
  requestId: string,
  requestVersion: number,
  runId: string,
) {
  assertSellerBriefSafe(value)
  const brief = value as SellerBrief
  if (brief.request.id !== requestId || brief.request.version !== requestVersion || brief.runId !== runId) {
    throwSellerError('WRONG_JOB_SCOPE', 'seller brief does not match the prepared job')
  }
  const briefDigest = await payloadDigest(brief)
  const existing = await ctx.db
    .query('sellerJobInputs')
    .withIndex('by_jobId', (query) => query.eq('jobId', jobId))
    .collect()
  if (existing.length > 1) throwSellerError('REPLAY_REJECTED', 'seller job has duplicate input records')
  if (existing.length === 1) {
    if (existing[0].briefDigest !== briefDigest) throwSellerError('REPLAY_REJECTED', 'seller job input cannot be replaced')
    return { replayed: true }
  }
  await ctx.db.insert('sellerJobInputs', {
    jobId,
    brief,
    briefDigest,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  return { replayed: false }
}

function publicCatalogSnapshot(snapshot: CatalogSnapshot) {
  return {
    variant: snapshot.variant,
    listing: {
      listing: snapshot.listing.listing,
      merchantId: snapshot.listing.merchantId,
      variantId: snapshot.listing.variantId,
      condition: snapshot.listing.condition,
      unitId: snapshot.listing.unitId,
      initialQuantity: snapshot.listing.initialQuantity,
      referenceUnitCents: snapshot.listing.referenceUnitCents,
      diagnosticAttributes: snapshot.listing.diagnosticAttributes,
    },
    availableQuantity: snapshot.availableQuantity,
  }
}

function publicPolicy(policy: PricingPolicy | null) {
  if (!policy) return null
  return {
    policy: policy.policy,
    merchantId: policy.merchantId,
    enabled: policy.enabled,
    shippingCents: policy.shippingCents,
    arrivalCalendarDays: policy.arrivalCalendarDays,
    warrantyMonths: policy.warrantyMonths,
    returnDays: policy.returnDays,
  }
}

function providerInput(
  job: {
    jobId: string
    runId: string
    phaseId: string
    role: SellerRole
    merchantId: string
    candidateIds: string[]
  },
  brief: SellerBrief,
  merchant: { merchantId: string; displayName: string },
  catalog: CatalogSnapshot[],
  policy: PricingPolicy | null,
) {
  const input = {
    schemaVersion: 1 as const,
    job: {
      jobId: job.jobId,
      runId: job.runId,
      phaseId: job.phaseId,
      role: job.role,
      merchantId: job.merchantId,
      candidateIds: [...job.candidateIds],
    },
    merchant,
    brief,
    catalog: catalog.map(publicCatalogSnapshot),
    policy: publicPolicy(policy),
  }
  assertNoPrivateSellerFields(input)
  return input
}

export const attachSellerBrief = internalMutation({
  args: { jobId: v.string(), brief: v.any() },
  handler: async (ctx: SellerMutationCtx, args: { jobId: string; brief: unknown }) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'seller job was not found')
    const job = jobs[0]
    if (job.status !== 'created') throwSellerError('REPLAY_REJECTED', 'seller brief cannot be attached after dispatch')
    return storeSellerBrief(ctx, job.jobId, args.brief, job.requestId, job.requestVersion, job.runId)
  },
})

export const getProviderJob = internalQuery({
  args: { jobId: v.string() },
  handler: async (ctx: SellerQueryCtx, args: { jobId: string }) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) return null
    const job = jobs[0]
    const inputs = await ctx.db
      .query('sellerJobInputs')
      .withIndex('by_jobId', (query) => query.eq('jobId', job.jobId))
      .collect()
    if (inputs.length > 1) throwSellerError('REPLAY_REJECTED', 'seller job has duplicate input records')
    if (inputs.length === 0) return { job, brief: null, input: null }
    const merchant = await requireMerchant(ctx, job.merchantId)
    const policy = await getPolicy(ctx, { id: job.policyId, version: job.policyVersion })
    const inputBrief = inputs[0].brief as SellerBrief
    assertSellerBriefSafe(inputBrief)
    const input = providerInput(
      job,
      inputBrief,
      { merchantId: merchant.merchantId, displayName: merchant.displayName },
      await loadSnapshots(ctx, job.merchantId),
      toPolicy(policy),
    )
    return { job, brief: inputBrief, input }
  },
})

export const claimSellerJob = internalMutation({
  args: { jobId: v.string(), poll: v.optional(v.boolean()), reconcile: v.optional(v.boolean()) },
  handler: async (
    ctx: SellerMutationCtx,
    args: { jobId: string; poll?: boolean; reconcile?: boolean },
  ) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) return null
    const job = jobs[0]
    if (['completed', 'failed', 'cancelled', 'stale'].includes(job.status)) return null
    if (Date.now() >= job.deadlineAt) {
      await ctx.db.patch(job._id, { status: 'stale', updatedAt: Date.now() })
      return null
    }
    const mode = args.reconcile ? 'reconcile' : args.poll ? 'poll' : 'start'
    const allowed = mode === 'start'
      ? job.status === 'created'
      : mode === 'poll'
        ? job.status === 'pending' && Boolean(job.providerRunId)
        : job.status === 'ambiguous'
    if (!allowed) return null
    const nextStatus = mode === 'start' ? 'starting' : 'polling'
    const attemptCount = job.attemptCount + 1
    await ctx.db.patch(job._id, {
      status: nextStatus,
      attemptCount,
      updatedAt: Date.now(),
    })
    await recordInternalEvent(ctx, job.merchantId, 'provider_started', {
      provider: job.provider,
      role: job.role,
      mode,
      attemptCount,
    }, [], job.jobId)
    return { ...job, status: nextStatus, attemptCount }
  },
})

export const recordProviderResult = internalMutation({
  args: {
    jobId: v.string(),
    status: v.union(v.literal('pending'), v.literal('failed')),
    providerRunId: v.union(v.string(), v.null()),
    providerModel: v.union(v.string(), v.null()),
    providerElapsedMs: v.union(v.number(), v.null()),
    errorCode: v.union(v.string(), v.null()),
    errorRetryable: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx: SellerMutationCtx, args) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'seller job was not found')
    const job = jobs[0]
    if (['completed', 'cancelled', 'stale'].includes(job.status)) return { replayed: true, retry: false, pending: false }
    if (!['starting', 'polling'].includes(job.status)) throwSellerError('REPLAY_REJECTED', 'provider result arrived for an unclaimed seller job')
    if (job.providerRunId && args.providerRunId && job.providerRunId !== args.providerRunId) {
      throwSellerError('WRONG_JOB_SCOPE', 'provider run ID does not match the seller job')
    }
    const providerRunId = args.providerRunId ?? job.providerRunId
    if (args.status === 'pending') {
      if (!providerRunId) throwSellerError('INVALID_INPUT', 'pending provider result must include a run ID')
      await ctx.db.patch(job._id, {
        status: 'pending',
        providerRunId,
        providerModel: args.providerModel,
        providerElapsedMs: args.providerElapsedMs,
        lastErrorCode: null,
        lastErrorRetryable: null,
        updatedAt: Date.now(),
      })
      await recordInternalEvent(ctx, job.merchantId, 'provider_pending', { providerRunId }, [], job.jobId)
      return { replayed: false, retry: false, pending: true }
    }
    const errorCode = args.errorCode ?? 'PROVIDER_PROTOCOL'
    const retryable = args.errorRetryable ?? false
    const ambiguous = job.status === 'starting'
      && !providerRunId
      && (errorCode === 'PROVIDER_TIMEOUT' || errorCode === 'PROVIDER_NETWORK')
    if (ambiguous) {
      await ctx.db.patch(job._id, {
        status: 'ambiguous',
        providerModel: args.providerModel,
        providerElapsedMs: args.providerElapsedMs,
        lastErrorCode: errorCode,
        lastErrorRetryable: retryable,
        updatedAt: Date.now(),
      })
      await recordInternalEvent(ctx, job.merchantId, 'provider_ambiguous', { errorCode }, [], job.jobId)
      return { replayed: false, retry: false, pending: false, ambiguous: true }
    }
    const canRetry = retryable && job.attemptCount < 4
    if (canRetry) {
      await ctx.db.patch(job._id, {
        status: providerRunId ? 'pending' : 'created',
        providerRunId,
        providerModel: args.providerModel,
        providerElapsedMs: args.providerElapsedMs,
        lastErrorCode: errorCode,
        lastErrorRetryable: retryable,
        updatedAt: Date.now(),
      })
      await recordInternalEvent(ctx, job.merchantId, 'provider_failed', { errorCode, retryable: true }, [], job.jobId)
      return { replayed: false, retry: true, poll: Boolean(providerRunId), pending: false }
    }
    await ctx.db.patch(job._id, {
      status: 'failed',
      providerRunId,
      providerModel: args.providerModel,
      providerElapsedMs: args.providerElapsedMs,
      lastErrorCode: errorCode,
      lastErrorRetryable: retryable,
      updatedAt: Date.now(),
    })
    await recordInternalEvent(ctx, job.merchantId, 'provider_failed', { errorCode, retryable: false }, [], job.jobId)
    return { replayed: false, retry: false, pending: false }
  },
})

export const markSellerJobCancelled = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx: SellerMutationCtx, args: { jobId: string }) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) return { cancelled: false, replayed: false }
    const job = jobs[0]
    if (['completed', 'failed', 'cancelled', 'stale'].includes(job.status)) return { cancelled: false, replayed: true }
    await ctx.db.patch(job._id, { status: 'cancelled', updatedAt: Date.now() })
    await recordInternalEvent(ctx, job.merchantId, 'provider_cancelled', { provider: job.provider }, [], job.jobId)
    return { cancelled: true, replayed: false }
  },
})

function providerMetadata(args: ValidateProposalArgs) {
  if (args.providerRunId === undefined && args.providerModel === undefined && args.providerElapsedMs === undefined) return {}
  return {
    providerRunId: args.providerRunId ?? null,
    providerModel: args.providerModel ?? null,
    providerElapsedMs: args.providerElapsedMs ?? null,
    lastErrorCode: null,
    lastErrorRetryable: null,
  }
}

export const validateAndStoreProposal = internalMutation({
  args: {
    jobId: v.string(),
    brief: v.any(),
    decision: v.any(),
    mode: v.optional(v.union(v.literal('fixture'), v.literal('live'), v.literal('cached'), v.literal('simulation'), v.literal('visa_sandbox'))),
    providerRunId: v.optional(v.union(v.string(), v.null())),
    providerModel: v.optional(v.union(v.string(), v.null())),
    providerElapsedMs: v.optional(v.union(v.number(), v.null())),
  },
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
    if (args.providerRunId !== undefined) {
      if (job.providerRunId && args.providerRunId && job.providerRunId !== args.providerRunId) {
        return { ok: false as const, outcome: 'rejected', reasons: [safeReason('WRONG_JOB_SCOPE', 'provider run does not match the seller job')] }
      }
      if (!['starting', 'polling', 'pending'].includes(job.status)) {
        return { ok: false as const, outcome: 'rejected', reasons: [safeReason('REPLAY_REJECTED', 'provider completion arrived outside the active job state')] }
      }
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
      await ctx.db.patch(job._id, { status: 'completed', ...providerMetadata(args), updatedAt: Date.now() })
      await recordInternalEvent(ctx, job.merchantId, 'provider_completed', { outcome: 'abstain' }, [], job.jobId)
      return { ok: true as const, outcome: 'abstain', reasons: [] }
    }
    if (decision.kind === 'hold') {
      const candidate = await findCandidateByOffer(ctx, job.jobId, decision.offer.id, job.merchantId)
      if (!candidate) return { ok: false as const, outcome: 'rejected', reasons: [safeReason('WRONG_JOB_SCOPE', 'hold references an unknown candidate or offer')] }
      await ctx.db.patch(candidate._id, { status: 'held', updatedAt: Date.now() })
      await ctx.db.patch(job._id, { status: 'completed', ...providerMetadata(args), updatedAt: Date.now() })
      await recordInternalEvent(ctx, job.merchantId, 'provider_completed', { outcome: 'hold' }, [], job.jobId)
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
      await ctx.db.patch(job._id, { status: 'completed', ...providerMetadata(args), updatedAt: Date.now() })
      await recordInternalEvent(ctx, job.merchantId, 'provider_completed', { outcome: 'rejected' }, validated.reasons, job.jobId, proposal.candidateId)
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
    await ctx.db.patch(job._id, { status: 'completed', ...providerMetadata(args), updatedAt: Date.now() })
    await recordInternalEvent(ctx, job.merchantId, 'offer_accepted', { offerId, version, totalCents: validated.offer.totalCents }, [], job.jobId, proposal.candidateId, offerId)
    await recordInternalEvent(ctx, job.merchantId, 'provider_completed', { outcome: 'accepted' }, [], job.jobId, proposal.candidateId, offerId)
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
