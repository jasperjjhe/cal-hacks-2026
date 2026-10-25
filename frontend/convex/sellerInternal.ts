import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { contracts } from '../src/contracts/index.ts'

import {
  assertSellerBriefSafe,
  assertNoPrivateSellerFields,
  parseSellerDecision,
  safeReason,
  type CatalogSnapshot,
  type CouncilJobInput,
  type FinalOfferCandidate,
  type OfferVersion,
  type PricingPolicy,
  type SellerAdvocacy,
  type SellerBrief,
  type SellerFinalDecision,
  type SellerProposal,
  type SellerReply,
  type SafeReason,
} from './lib/sellerContracts.ts'
import { validateFinalOfferRevision, validateSellerProposal } from './lib/sellerValidation.ts'
import {
  payloadDigest,
  requireMerchant,
  throwSellerError,
  type SellerMutationCtx,
  type SellerQueryCtx,
} from './sellerAuth.ts'

const refValidator = v.object({ id: v.string(), version: v.number() })

type Provider = 'fixture' | 'fetch' | 'creao'
type SellerRole = 'seller_initial' | 'seller_response' | 'seller_final' | 'seller_advocacy' | 'seller_reply'
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
  deferPromotion?: boolean
}

type CouncilRole = 'seller_advocacy' | 'seller_reply'
type V2SellerRole = CouncilRole | 'seller_final'

function isCouncilSellerRole(role: SellerRole): role is CouncilRole {
  return role === 'seller_advocacy' || role === 'seller_reply'
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

function isV2SellerRole(role: SellerRole): role is V2SellerRole {
  return role === 'seller_advocacy' || role === 'seller_reply' || role === 'seller_final'
}

function assertLiveDeadline(deadlineAt: number) {
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now()) {
    throwSellerError('LATE_COMPLETION', 'seller job deadline is expired')
  }
}

function assertRoleInputScope(
  role: SellerRole,
  job: { jobId: string; runId: string; phaseId: string; merchantId: string; deadlineAt: number },
  input: unknown,
): unknown {
  if (!isV2SellerRole(role)) {
    const parsed = contracts.SellerBrief.parse(input)
    if (parsed.runId !== job.runId) throwSellerError('WRONG_JOB_SCOPE', 'seller brief run does not match the prepared job')
    return parsed
  }
  try {
    assertLiveDeadline(job.deadlineAt)
    if (role === 'seller_final') {
      const parsed = contracts.SellerFinalJobInput.parse(input)
      if (
        parsed.jobId !== job.jobId ||
        parsed.runId !== job.runId ||
        parsed.merchantId !== job.merchantId ||
        parsed.deadlineAt !== job.deadlineAt
      ) {
        throwSellerError('WRONG_JOB_SCOPE', 'final seller input is outside the prepared job scope')
      }
      return parsed
    }
    const parsed = contracts.CouncilJobInput.parse(input)
    if (
      parsed.jobId !== job.jobId ||
      parsed.runId !== job.runId ||
      job.phaseId !== parsed.phase && job.phaseId !== 'council' ||
      parsed.phase !== (role === 'seller_advocacy' ? 'advocacy' : 'reply') ||
      parsed.merchantId !== job.merchantId
    ) {
      throwSellerError('WRONG_JOB_SCOPE', 'council seller input is outside the prepared job scope')
    }
    if (parsed.deadlineAt !== job.deadlineAt) throwSellerError('WRONG_JOB_SCOPE', 'council seller input deadline does not match the prepared job')
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message.includes('seller input')) throw error
    throwSellerError('INVALID_INPUT', 'seller role input does not match the canonical v2 contract')
  }
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
  finalServiceOptions?: PricingPolicy['finalServiceOptions']
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
    finalServiceOptions: document.finalServiceOptions?.map((option) => ({ ...option })) ?? [],
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
    role: v.union(
      v.literal('seller_initial'),
      v.literal('seller_response'),
      v.literal('seller_final'),
      v.literal('seller_advocacy'),
      v.literal('seller_reply'),
    ),
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
      // A council advocacy/reply job references the frozen opening candidate but
      // does not own or mutate its commercial lifecycle. The opening seller job
      // remains the sole owner of the candidate record.
      if (candidates.length > 0 && candidates[0].jobId !== args.jobId && !isCouncilSellerRole(args.role)) {
        throwSellerError('REPLAY_REJECTED', 'candidate is already bound to another seller job')
      }
      if (candidates.length === 0) {
        if (isCouncilSellerRole(args.role)) throwSellerError('WRONG_JOB_SCOPE', 'council candidate is not bound to an opening offer')
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
    if (existing[0].brief === null || existing[0].brief === undefined) {
      await ctx.db.patch(existing[0]._id, { brief, briefDigest, updatedAt: Date.now() })
      return { replayed: false }
    }
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

export const attachSellerProviderInput = internalMutation({
  args: { jobId: v.string(), input: v.any() },
  handler: async (ctx: SellerMutationCtx, args: { jobId: string; input: unknown }) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .collect()
    if (jobs.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'seller job was not found')
    const job = jobs[0]
    if (job.status !== 'created') throwSellerError('REPLAY_REJECTED', 'provider input cannot be attached after dispatch')
    assertNoPrivateSellerFields(args.input)
    const input = assertRoleInputScope(job.role, job, args.input)
    const inputDigest = await payloadDigest(input)
    if (job.inputDigest !== inputDigest) {
      await ctx.db.patch(job._id, { inputDigest, inputRef: `${job.jobId}:input`, updatedAt: Date.now() })
    }
    const existing = await ctx.db
      .query('sellerJobInputs')
      .withIndex('by_jobId', (query) => query.eq('jobId', job.jobId))
      .collect()
    if (existing.length > 1) throwSellerError('REPLAY_REJECTED', 'seller job has duplicate input records')
    if (existing.length === 1) {
      if (existing[0].roleInputDigest === inputDigest) return { replayed: true }
      if (existing[0].roleInput !== undefined && existing[0].roleInput !== null) {
        throwSellerError('REPLAY_REJECTED', 'seller provider input cannot be replaced')
      }
      await ctx.db.patch(existing[0]._id, { roleInput: input, roleInputDigest: inputDigest, updatedAt: Date.now() })
      return { replayed: false }
    }
    await ctx.db.insert('sellerJobInputs', {
      jobId: job.jobId,
      brief: null,
      briefDigest: inputDigest,
      roleInput: input,
      roleInputDigest: inputDigest,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return { replayed: false }
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
    const inputBrief = inputs[0].brief as SellerBrief | null
    const roleInput = inputs[0].roleInput
    if (roleInput !== undefined && roleInput !== null) {
      const input = assertRoleInputScope(job.role, job, roleInput)
      return { job, brief: inputBrief, input }
    }
    if (!inputBrief) return { job, brief: null, input: null }
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

function sameRef(left: { id: string; version: number }, right: { id: string; version: number }) {
  return left.id === right.id && left.version === right.version
}

function assertApprovedIds(values: string[], allowed: Set<string>, field: string) {
  if (values.length > 40 || values.some((value) => !allowed.has(value))) {
    throwSellerError('MALFORMED_PROVIDER_OUTPUT', `${field} contains an unapproved reference`, field)
  }
}

function assertCouncilOutputScope(
  input: CouncilJobInput,
  output: SellerAdvocacy | SellerReply,
) {
  if (
    output.jobId !== input.jobId ||
    output.councilId !== input.councilId ||
    !sameRef(output.request, input.request) ||
    output.runId !== input.runId ||
    !sameRef(output.snapshot, input.snapshot) ||
    output.snapshotDigest !== input.snapshotDigest ||
    output.phase !== input.phase ||
    output.deadlineAt !== input.deadlineAt
  ) {
    throwSellerError('WRONG_JOB_SCOPE', 'council seller output is outside the prepared job scope')
  }
}

function validateAdvocacyOutput(input: CouncilJobInput, output: SellerAdvocacy) {
  assertCouncilOutputScope(input, output)
  const allowedFacts = new Set(input.facts.map((fact) => fact.id))
  const allowedSources = new Set(input.competition.approvedSourceIds)
  const ownOffers = new Set(input.ownOffers.map((offer) => `${offer.id}:${offer.version}`))
  for (const defense of output.defenses) {
    if (!ownOffers.has(`${defense.ownOffer.id}:${defense.ownOffer.version}`)) {
      throwSellerError('WRONG_JOB_SCOPE', 'seller defense references a rival offer', 'defenses.ownOffer')
    }
    assertApprovedIds(defense.factIds, allowedFacts, 'defenses.factIds')
    assertApprovedIds(defense.sourceIds, allowedSources, 'defenses.sourceIds')
  }
  if (output.challenge) {
    const target = input.competition.offers.find((offer) => sameRef(offer.offer, output.challenge!.targetOffer))
    if (!target || target.merchantId === input.merchantId) {
      throwSellerError('WRONG_JOB_SCOPE', 'seller challenge must target one rival offer', 'challenge.targetOffer')
    }
    if (output.challenge.claimId && !target.claims.some((claim) => claim.id === output.challenge!.claimId)) {
      throwSellerError('MALFORMED_PROVIDER_OUTPUT', 'seller challenge references an unknown claim', 'challenge.claimId')
    }
    if (output.challenge.factId && !input.facts.some((fact) => fact.id === output.challenge!.factId)) {
      throwSellerError('MALFORMED_PROVIDER_OUTPUT', 'seller challenge references an unknown fact', 'challenge.factId')
    }
    assertApprovedIds(output.challenge.sourceIds, allowedSources, 'challenge.sourceIds')
  }
}

function validateReplyOutput(input: CouncilJobInput, output: SellerReply) {
  assertCouncilOutputScope(input, output)
  if (output.answers.length !== input.challenges.length) {
    throwSellerError('MALFORMED_PROVIDER_OUTPUT', 'seller reply must answer every admitted challenge exactly once', 'answers')
  }
  const challengeIds = new Set(input.challenges.map((challenge) => challenge.id))
  const seen = new Set<string>()
  const allowedFacts = new Set(input.facts.map((fact) => fact.id))
  const allowedSources = new Set(input.competition.approvedSourceIds)
  for (const answer of output.answers) {
    if (!challengeIds.has(answer.challengeId) || seen.has(answer.challengeId)) {
      throwSellerError('MALFORMED_PROVIDER_OUTPUT', 'seller reply contains an unknown or duplicate challenge', 'answers.challengeId')
    }
    seen.add(answer.challengeId)
    assertApprovedIds(answer.factIds, allowedFacts, 'answers.factIds')
    assertApprovedIds(answer.sourceIds, allowedSources, 'answers.sourceIds')
  }
}

function redactFinalDecision(output: SellerFinalDecision): SellerFinalDecision {
  if (output.decision.kind !== 'propose') return output
  return {
    ...output,
    decision: {
      ...output.decision,
      proposal: { ...output.decision.proposal, privatePriceRationale: '[redacted]' },
    },
  }
}

export const recordV2ProviderResult = internalMutation({
  args: {
    jobId: v.string(),
    output: v.any(),
    providerRunId: v.string(),
    providerModel: v.union(v.string(), v.null()),
    providerElapsedMs: v.number(),
  },
  handler: async (ctx: SellerMutationCtx, args) => {
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_jobId', (query) => query.eq('jobId', args.jobId))
      .take(2)
    if (jobs.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'seller job was not found')
    const job = jobs[0]
    if (job.providerRunId && job.providerRunId !== args.providerRunId) {
      throwSellerError('WRONG_JOB_SCOPE', 'provider run does not match the seller job')
    }
    const existing = await ctx.db
      .query('sellerJobResults')
      .withIndex('by_jobId', (query) => query.eq('jobId', job.jobId))
      .take(2)
    const outputDigest = await payloadDigest(args.output)
    if (existing.length > 1) throwSellerError('REPLAY_REJECTED', 'seller job has duplicate result records')
    if (existing.length === 1) {
      if (existing[0].outputDigest === outputDigest) return { ok: true as const, replayed: true, outcome: 'replayed' as const }
      throwSellerError('REPLAY_REJECTED', 'seller provider output cannot be replaced')
    }
    if (!['starting', 'polling', 'pending'].includes(job.status)) {
      throwSellerError('REPLAY_REJECTED', 'seller provider output arrived outside the active job state')
    }
    const inputs = await ctx.db
      .query('sellerJobInputs')
      .withIndex('by_jobId', (query) => query.eq('jobId', job.jobId))
      .take(2)
    if (inputs.length !== 1 || inputs[0].roleInput === undefined || inputs[0].roleInput === null) {
      throwSellerError('INVALID_INPUT', 'v2 seller job input is missing')
    }
    const input = assertRoleInputScope(job.role, job, inputs[0].roleInput)
    let storedOutput: unknown = args.output
    let outcome = 'accepted'
    let finalOfferRef: { id: string; version: number } | null = null
    if (job.role === 'seller_advocacy') {
      const parsed = contracts.SellerAdvocacy.parse(args.output)
      validateAdvocacyOutput(input as CouncilJobInput, parsed)
      storedOutput = parsed
      outcome = 'advocacy'
    } else if (job.role === 'seller_reply') {
      const parsed = contracts.SellerReply.parse(args.output)
      validateReplyOutput(input as CouncilJobInput, parsed)
      storedOutput = parsed
      outcome = 'reply'
    } else if (job.role === 'seller_final') {
      const parsed = contracts.SellerFinalDecision.parse(args.output)
      const finalInput = input as ReturnType<typeof contracts.SellerFinalJobInput.parse>
      if (
        parsed.jobId !== finalInput.jobId ||
        parsed.roundId !== finalInput.roundId ||
        parsed.candidateId !== finalInput.candidateId ||
        parsed.councilId !== finalInput.councilId ||
        parsed.snapshotDigest !== finalInput.snapshotDigest ||
        parsed.outcomeVersion !== finalInput.outcomeVersion ||
        (parsed.snapshot && finalInput.snapshot && !sameRef(parsed.snapshot, finalInput.snapshot))
      ) {
        throwSellerError('WRONG_JOB_SCOPE', 'final seller output is outside the invitation scope')
      }
      if (parsed.decision.kind === 'propose') {
        const proposal = parsed.decision.proposal
        if (
          proposal.jobId !== job.jobId ||
          proposal.candidateId !== finalInput.candidateId ||
          !proposal.parentOffer ||
          !sameRef(proposal.parentOffer, finalInput.ownOffer.offer) ||
          !sameRef(proposal.policy, finalInput.policy)
        ) {
          throwSellerError('WRONG_JOB_SCOPE', 'final proposal is not parent-bound to the invitation')
        }
        const openingRows = await ctx.db
          .query('offerVersions')
          .withIndex('by_offerId_and_version', (query) => query.eq('offerId', finalInput.ownOffer.offer.id).eq('version', finalInput.ownOffer.offer.version))
          .take(2)
        if (openingRows.length !== 1) throwSellerError('WRONG_JOB_SCOPE', 'opening seller offer was not found')
        const openingRow = openingRows[0]
        if (openingRow.merchantId !== job.merchantId || openingRow.candidateId !== finalInput.candidateId) {
          throwSellerError('WRONG_JOB_SCOPE', 'opening seller offer belongs to another candidate')
        }
        const policyDocument = await getPolicy(ctx, { id: job.policyId, version: job.policyVersion })
        const policy = toPolicy(policyDocument)
        const currentCatalog = await loadSnapshots(ctx, job.merchantId)
        const openingCatalog = (inputs[0].openingCatalog as CatalogSnapshot[] | undefined) ?? currentCatalog
        const openingOffer: OfferVersion = {
          schemaVersion: 1,
          offer: { id: openingRow.offerId, version: openingRow.version },
          jobId: openingRow.jobId,
          candidateId: openingRow.candidateId,
          merchantId: openingRow.merchantId,
          parentOffer: openingRow.parentOffer,
          policy: openingRow.policy,
          serviceOptionId: openingRow.serviceOptionId ?? null,
          lines: openingRow.lines,
          itemsCents: openingRow.itemsCents,
          shippingCents: openingRow.shippingCents,
          totalCents: openingRow.totalCents,
          arrivalCalendarDays: openingRow.arrivalCalendarDays,
          warrantyMonths: openingRow.warrantyMonths,
          returnDays: openingRow.returnDays,
          fit: {
            ...openingRow.fit,
            requirements: openingRow.fit.requirements.map((requirement) => ({
              ...requirement,
              weight: requirement.weight === 2 ? 2 as const : 1 as const,
            })),
            reasons: openingRow.fit.reasons.map((reason) => ({
              ...reason,
              code: reason.code as SafeReason['code'],
            })),
          },
          claims: openingRow.claims,
          status: openingRow.status,
          mode: openingRow.mode,
          createdAt: openingRow.createdAt,
        }
        const candidate: FinalOfferCandidate = {
          candidateId: proposal.candidateId,
          parentOffer: proposal.parentOffer,
          policy: proposal.policy,
          serviceOptionId: proposal.serviceOptionId,
          lines: proposal.lines,
        }
        const validated = validateFinalOfferRevision({
          jobId: job.jobId,
          merchantId: job.merchantId,
          candidateId: finalInput.candidateId,
          brief: { ...finalInput.brief, runId: finalInput.runId },
          openingOffer,
          openingCatalog,
          currentCatalog,
          policy,
          now: Date.now(),
          mode: 'live',
        }, candidate)
        if (!validated.ok) {
          outcome = 'rejected'
          storedOutput = redactFinalDecision(parsed)
        } else {
          const priorOffers = await ctx.db
            .query('offerVersions')
            .withIndex('by_candidateId_and_version', (query) => query.eq('candidateId', proposal.candidateId))
            .collect()
          const version = priorOffers.reduce((maximum, offer) => Math.max(maximum, offer.version), 0) + 1
          const offerId = `${job.jobId}:${proposal.candidateId}`
          finalOfferRef = { id: offerId, version }
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
            serviceOptionId: validated.offer.serviceOptionId,
            fit: validated.offer.fit,
            claims: validated.offer.claims,
            status: validated.offer.status,
            mode: validated.offer.mode,
            createdAt: validated.offer.createdAt,
          })
          await ctx.db.insert('fitAssessments', {
            offerId,
            offerVersion: version,
            merchantId: job.merchantId,
            assessment: validated.offer.fit,
            createdAt: Date.now(),
          })
          storedOutput = redactFinalDecision(parsed)
        }
      } else {
        if (parsed.decision.jobId !== job.jobId) throwSellerError('WRONG_JOB_SCOPE', 'final hold/abstain references another job')
        if (parsed.decision.kind === 'hold' && !sameRef(parsed.decision.offer, finalInput.ownOffer.offer)) {
          throwSellerError('WRONG_JOB_SCOPE', 'final hold references a different offer')
        }
        storedOutput = parsed
        outcome = parsed.decision.kind
      }
    } else {
      throwSellerError('INVALID_INPUT', 'v2 result received for a legacy seller role')
    }
    await ctx.db.insert('sellerJobResults', {
      jobId: job.jobId,
      role: job.role,
      output: storedOutput,
      outputDigest,
      validatedOffer: finalOfferRef,
      providerRunId: args.providerRunId,
      providerModel: args.providerModel,
      providerElapsedMs: args.providerElapsedMs,
      createdAt: Date.now(),
    })
    await ctx.db.patch(job._id, {
      status: 'completed',
      providerRunId: args.providerRunId,
      providerModel: args.providerModel,
      providerElapsedMs: args.providerElapsedMs,
      lastErrorCode: null,
      lastErrorRetryable: null,
      updatedAt: Date.now(),
    })
    await recordInternalEvent(ctx, job.merchantId, 'provider_completed', { outcome, finalOfferRef }, [], job.jobId, job.candidateIds[0] ?? null, finalOfferRef?.id ?? null)
    return { ok: true as const, replayed: false, outcome, offer: finalOfferRef }
  },
})

export const getV2ProviderResult = internalQuery({
  args: { jobId: v.string() },
  handler: async (ctx: SellerQueryCtx, args: { jobId: string }) => {
    const rows = await ctx.db.query('sellerJobResults').withIndex('by_jobId', (query) => query.eq('jobId', args.jobId)).take(2)
    if (rows.length > 1) throwSellerError('REPLAY_REJECTED', 'seller job has duplicate result records')
    return rows[0] ?? null
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
    deferPromotion: v.optional(v.boolean()),
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
      serviceOptionId: validated.offer.serviceOptionId,
      fit: validated.offer.fit,
      claims: validated.offer.claims,
      status: validated.offer.status,
      mode: validated.offer.mode,
      createdAt: validated.offer.createdAt,
    })
    const candidate = await findCandidate(ctx, job.jobId, proposal.candidateId, job.merchantId)
    if (candidate && !args.deferPromotion) {
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
    const inputRows = await ctx.db
      .query('sellerJobInputs')
      .withIndex('by_jobId', (query) => query.eq('jobId', job.jobId))
      .take(1)
    if (inputRows.length === 1 && inputRows[0].openingCatalog === undefined) {
      await ctx.db.patch(inputRows[0]._id, {
        openingCatalog: context.catalog,
        openingCatalogDigest: await payloadDigest(context.catalog),
        updatedAt: Date.now(),
      })
    }
    await ctx.db.patch(job._id, { status: 'completed', ...providerMetadata(args), updatedAt: Date.now() })
    if (!args.deferPromotion) {
      await recordInternalEvent(ctx, job.merchantId, 'offer_accepted', { offerId, version, totalCents: validated.offer.totalCents }, [], job.jobId, proposal.candidateId, offerId)
    }
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
