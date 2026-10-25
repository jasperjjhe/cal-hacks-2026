import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import {
  type Attribute,
  type Listing,
  type PricingPolicy,
  type Ref,
  SellerContractError,
} from './lib/sellerContracts.ts'
import { applyPolicyChanges, type PolicyChanges, validatePolicyValues } from './lib/sellerValidation.ts'
import {
  assertBoundedCursor,
  payloadDigest,
  requireMerchant,
  requireSellerMembership,
  throwSellerError,
  type SellerMutationCtx,
  type SellerQueryCtx,
} from './sellerAuth.ts'

const refValidator = v.object({ id: v.string(), version: v.number() })
const attributeValidator = v.object({
  value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null()),
  unit: v.union(v.string(), v.null()),
  provenance: v.union(v.literal('manufacturer'), v.literal('real_report'), v.literal('synthetic_demo')),
  sourceId: v.union(v.string(), v.null()),
})
const attributesValidator = v.record(v.string(), attributeValidator)
const listingPatchValidator = v.object({
  variantId: v.optional(v.string()),
  condition: v.optional(v.union(v.literal('new'), v.literal('refurbished'))),
  initialQuantity: v.optional(v.number()),
  referenceUnitCents: v.optional(v.number()),
  operatorFloorCents: v.optional(v.number()),
  diagnosticAttributes: v.optional(attributesValidator),
  enabled: v.optional(v.boolean()),
})
const policyChangesValidator = v.object({
  enabled: v.optional(v.boolean()),
  maxDiscountBps: v.optional(v.number()),
  unitCostByListing: v.optional(v.record(v.string(), v.number())),
  minimumContributionByListing: v.optional(v.record(v.string(), v.number())),
  costsAreSynthetic: v.optional(v.boolean()),
  shippingCents: v.optional(v.number()),
  arrivalCalendarDays: v.optional(v.number()),
  warrantyMonths: v.optional(v.number()),
  returnDays: v.optional(v.number()),
  finalServiceOptions: v.optional(v.array(v.object({
    id: v.string(),
    shippingCents: v.number(),
    arrivalCalendarDays: v.number(),
    warrantyMonths: v.number(),
    returnDays: v.number(),
    incrementalCostCents: v.number(),
  }))),
})

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function listingRef(listing: { listingId: string; version: number }): Ref {
  return { id: listing.listingId, version: listing.version }
}

async function getListing(ctx: SellerQueryCtx | SellerMutationCtx, reference: Ref) {
  const matches = await ctx.db
    .query('listingVersions')
    .withIndex('by_listingId_and_version', (query) => query.eq('listingId', reference.id).eq('version', reference.version))
    .collect()
  if (matches.length !== 1) throwSellerError('LISTING_VERSION_STALE', 'listing version was not found', 'listing')
  return matches[0]
}

async function getPolicy(ctx: SellerQueryCtx | SellerMutationCtx, reference: Ref | null) {
  if (!reference) return null
  const matches = await ctx.db
    .query('policyVersions')
    .withIndex('by_policyId_and_version', (query) => query.eq('policyId', reference.id).eq('version', reference.version))
    .collect()
  if (matches.length !== 1) throwSellerError('POLICY_VERSION_STALE', 'policy version was not found', 'policy')
  return matches[0]
}

function projectListing(listing: {
  listingId: string
  merchantId: string
  version: number
  variantId: string
  condition: 'new' | 'refurbished'
  unitId: string | null
  initialQuantity: number
  referenceUnitCents: number
  operatorFloorCents: number
  diagnosticAttributes: Record<string, Attribute>
  enabled: boolean
}) {
  return {
    listing: listingRef(listing),
    merchantId: listing.merchantId,
    variantId: listing.variantId,
    condition: listing.condition,
    unitId: listing.unitId,
    initialQuantity: listing.initialQuantity,
    referenceUnitCents: listing.referenceUnitCents,
    operatorFloorCents: listing.operatorFloorCents,
    diagnosticAttributes: listing.diagnosticAttributes,
    enabled: listing.enabled,
  }
}

function projectPolicy(policy: {
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
    policy: { id: policy.policyId, version: policy.version },
    merchantId: policy.merchantId,
    enabled: policy.enabled,
    maxDiscountBps: policy.maxDiscountBps,
    unitCostByListing: { ...policy.unitCostByListing },
    minimumContributionByListing: { ...policy.minimumContributionByListing },
    costsAreSynthetic: policy.costsAreSynthetic,
    shippingCents: policy.shippingCents,
    arrivalCalendarDays: policy.arrivalCalendarDays,
    warrantyMonths: policy.warrantyMonths,
    returnDays: policy.returnDays,
    finalServiceOptions: policy.finalServiceOptions?.map((option) => ({ ...option })) ?? [],
  }
}

async function recordEvent(
  ctx: SellerMutationCtx,
  event: {
    merchantId: string
    eventType:
      | 'listing_published'
      | 'policy_published'
      | 'merchant_paused'
      | 'merchant_resumed'
      | 'proposal_received'
      | 'proposal_rejected'
      | 'offer_accepted'
      | 'allocation_changed'
      | 'provider_started'
      | 'provider_pending'
      | 'provider_completed'
      | 'provider_failed'
      | 'provider_ambiguous'
      | 'provider_cancelled'
    jobId?: string | null
    candidateId?: string | null
    offerId?: string | null
    safeReasons?: Array<{ code: string; field: string | null; message: string }>
    payload: unknown
  },
) {
  await ctx.db.insert('sellerEvents', {
    merchantId: event.merchantId,
    eventType: event.eventType,
    jobId: event.jobId ?? null,
    candidateId: event.candidateId ?? null,
    offerId: event.offerId ?? null,
    safeReasons: event.safeReasons ?? [],
    payloadDigest: await payloadDigest(event.payload),
    createdAt: Date.now(),
  })
}

export const getMerchantView = query({
  args: {},
  handler: async (ctx: SellerQueryCtx) => {
    const membership = await requireSellerMembership(ctx)
    const merchant = await requireMerchant(ctx, membership.merchantId)
    const listings = await ctx.db
      .query('listingVersions')
      .withIndex('by_merchantId_and_enabled', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    const policies = await ctx.db
      .query('policyVersions')
      .withIndex('by_merchantId_and_version', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    const events = await ctx.db
      .query('sellerEvents')
      .withIndex('by_merchantId_and_createdAt', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    const offers = await ctx.db
      .query('offerVersions')
      .withIndex('by_merchantId_and_createdAt', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    const latestPolicies = policies
      .sort((left, right) => right.version - left.version)
      .slice(0, 20)
    const latestEvents = events
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 50)
    return {
      merchant: {
        merchantId: merchant.merchantId,
        displayName: merchant.displayName,
        enabled: merchant.enabled,
        paused: merchant.paused,
        currentPolicy: merchant.currentPolicyId
          ? { id: merchant.currentPolicyId, version: merchant.currentPolicyVersion }
          : null,
      },
      listings: listings
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(projectListing),
      policies: latestPolicies.map(projectPolicy),
      recentOffers: offers.slice(0, 20).map((offer) => ({
        offer: { id: offer.offerId, version: offer.version },
        jobId: offer.jobId,
        candidateId: offer.candidateId,
        status: offer.status,
        totalCents: offer.totalCents,
        mode: offer.mode,
        createdAt: offer.createdAt,
      })),
      analytics: {
        reportingPeriod: latestEvents.length > 0
          ? { from: Math.min(...latestEvents.map((event) => event.createdAt)), to: Math.max(...latestEvents.map((event) => event.createdAt)) }
          : null,
        observedEventCount: latestEvents.length,
        proposalEventCount: latestEvents.filter((event) => event.eventType === 'proposal_received').length,
        rejectedProposalEventCount: latestEvents.filter((event) => event.eventType === 'proposal_rejected').length,
        acceptedOfferEventCount: latestEvents.filter((event) => event.eventType === 'offer_accepted').length,
      },
      recentEvents: latestEvents.map((event) => ({
        eventType: event.eventType,
        jobId: event.jobId,
        candidateId: event.candidateId,
        offerId: event.offerId,
        safeReasons: event.safeReasons,
        createdAt: event.createdAt,
      })),
    }
  },
})

export const updateOwnListing = mutation({
  args: { listing: refValidator, patch: listingPatchValidator },
  handler: async (ctx: SellerMutationCtx, args: { listing: Ref; patch: Record<string, unknown> }) => {
    const membership = await requireSellerMembership(ctx)
    const current = await getListing(ctx, args.listing)
    if (current.merchantId !== membership.merchantId) throwSellerError('WRONG_MERCHANT_SCOPE', 'listing is not owned by the authenticated merchant')
    const patch = args.patch
    const { _id, _creationTime, ...fields } = current
    void _id
    void _creationTime
    const latest = await ctx.db
      .query('listingVersions')
      .withIndex('by_listingId_and_version', (q) => q.eq('listingId', current.listingId))
      .order('desc')
      .first()
    if (latest?.version !== current.version) throwSellerError('LISTING_VERSION_STALE', 'listing version is stale')
    const next = {
      ...fields,
      version: current.version + 1,
      variantId: typeof patch.variantId === 'string' ? patch.variantId : current.variantId,
      condition: patch.condition === 'new' || patch.condition === 'refurbished' ? patch.condition : current.condition,
      initialQuantity: typeof patch.initialQuantity === 'number' ? patch.initialQuantity : current.initialQuantity,
      referenceUnitCents: typeof patch.referenceUnitCents === 'number' ? patch.referenceUnitCents : current.referenceUnitCents,
      operatorFloorCents: typeof patch.operatorFloorCents === 'number' ? patch.operatorFloorCents : current.operatorFloorCents,
      diagnosticAttributes: patch.diagnosticAttributes && typeof patch.diagnosticAttributes === 'object'
        ? patch.diagnosticAttributes as Record<string, Attribute>
        : current.diagnosticAttributes,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      createdAt: Date.now(),
    }
    if (!isSafeInteger(next.initialQuantity) || next.initialQuantity > 10_000) throwSellerError('QUANTITY_INVALID', 'initial quantity is invalid', 'patch.initialQuantity')
    if (!isSafeInteger(next.referenceUnitCents, 1) || !isSafeInteger(next.operatorFloorCents) || next.operatorFloorCents > next.referenceUnitCents) {
      throwSellerError('INVALID_INPUT', 'reference and floor prices are invalid', 'patch')
    }
    const variantMatches = await ctx.db
      .query('variants')
      .withIndex('by_variantId', (query) => query.eq('variantId', next.variantId))
      .collect()
    if (variantMatches.length !== 1) throwSellerError('INVALID_INPUT', 'variant was not found', 'patch.variantId')
    const committedStates = ['reserved', 'execution_locked', 'sold'] as const
    let committedQuantity = 0
    for (const state of committedStates) {
      const allocations = await ctx.db
        .query('allocations')
        .withIndex('by_listingId_and_state', (query) => query.eq('listingId', current.listingId).eq('state', state))
        .collect()
      committedQuantity += allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
    }
    if (next.initialQuantity < committedQuantity) {
      throwSellerError('QUANTITY_INVALID', 'quantity cannot erase already committed stock', 'patch.initialQuantity')
    }
    await ctx.db.patch(_id, { enabled: false })
    const insertedId = await ctx.db.insert('listingVersions', next)
    await recordEvent(ctx, {
      merchantId: membership.merchantId,
      eventType: 'listing_published',
      payload: { listingId: current.listingId, version: next.version, insertedId },
    })
    return { listing: { id: next.listingId, version: next.version } }
  },
})

export const publishOwnPolicy = mutation({
  args: { expectedPolicy: v.union(refValidator, v.null()), changes: policyChangesValidator },
  handler: async (ctx: SellerMutationCtx, args: { expectedPolicy: Ref | null; changes: PolicyChanges }) => {
    const membership = await requireSellerMembership(ctx)
    const merchant = await requireMerchant(ctx, membership.merchantId)
    const currentReference = merchant.currentPolicyId
      ? { id: merchant.currentPolicyId, version: merchant.currentPolicyVersion }
      : null
    if (currentReference?.id !== args.expectedPolicy?.id || currentReference?.version !== args.expectedPolicy?.version) {
      throwSellerError('POLICY_VERSION_STALE', 'expected policy version does not match current policy', 'expectedPolicy')
    }
    if (!currentReference) throwSellerError('INVALID_INPUT', 'merchant policy must be provisioned before it can be edited')
    const currentDocument = await getPolicy(ctx, currentReference)
    if (!currentDocument) throwSellerError('POLICY_VERSION_STALE', 'current policy was not found')
    const current = projectPolicy(currentDocument)
    const next = applyPolicyChanges(current, args.changes, current.policy.version + 1)
    const reasons = validatePolicyValues(next)
    if (reasons.length) throwSellerError(reasons[0].code, reasons[0].message, reasons[0].field)
    await ctx.db.insert('policyVersions', {
      policyId: next.policy.id,
      merchantId: next.merchantId,
      version: next.policy.version,
      enabled: next.enabled,
      maxDiscountBps: next.maxDiscountBps,
      unitCostByListing: next.unitCostByListing,
      minimumContributionByListing: next.minimumContributionByListing,
      costsAreSynthetic: next.costsAreSynthetic,
      shippingCents: next.shippingCents,
      arrivalCalendarDays: next.arrivalCalendarDays,
      warrantyMonths: next.warrantyMonths,
      returnDays: next.returnDays,
      finalServiceOptions: next.finalServiceOptions,
      createdAt: Date.now(),
    })
    await ctx.db.patch(merchant._id, {
      currentPolicyId: next.policy.id,
      currentPolicyVersion: next.policy.version,
      updatedAt: Date.now(),
    })
    await recordEvent(ctx, {
      merchantId: membership.merchantId,
      eventType: 'policy_published',
      payload: { policyId: next.policy.id, version: next.policy.version },
    })
    return { policy: next.policy }
  },
})

export const pauseOwnMerchant = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx: SellerMutationCtx, args: { paused: boolean }) => {
    const membership = await requireSellerMembership(ctx)
    const merchant = await requireMerchant(ctx, membership.merchantId)
    if (merchant.paused !== args.paused) {
      await ctx.db.patch(merchant._id, { paused: args.paused, updatedAt: Date.now() })
      await recordEvent(ctx, {
        merchantId: membership.merchantId,
        eventType: args.paused ? 'merchant_paused' : 'merchant_resumed',
        payload: { paused: args.paused },
      })
    }
    return { merchantId: merchant.merchantId, paused: args.paused }
  },
})

// Bind a newly authenticated session to an internally provisioned merchant grant.
// The grant, not a user-controlled subject prefix, is the authority boundary.
export const bindOperatorSession = mutation({
  args: {},
  handler: async (ctx: SellerMutationCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    const userId = await getAuthUserId(ctx)
    if (!identity?.tokenIdentifier || !userId) throwSellerError('UNAUTHENTICATED', 'operator login required')
    const grants = await ctx.db
      .query('operatorAccounts')
      .withIndex('by_user', (q) => q.eq('userId', String(userId)))
      .collect()
    const active = grants.filter((grant) => grant.enabled)
    if (active.length !== 1) throwSellerError('UNAUTHORIZED', 'operator account is missing or ambiguous')
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_authTokenIdentifier', (q) => q.eq('authTokenIdentifier', identity.tokenIdentifier))
      .collect()
    if (memberships.some((membership) => membership.merchantId !== active[0].merchantId)) {
      throwSellerError('UNAUTHORIZED', 'session membership conflicts with account grant')
    }
    if (memberships.length === 0) {
      await ctx.db.insert('memberships', {
        authTokenIdentifier: identity.tokenIdentifier,
        merchantId: active[0].merchantId,
        role: 'operator',
        enabled: true,
        createdAt: Date.now(),
      })
    }
    return { merchantId: active[0].merchantId }
  },
})

export const getOwnAgentJobs = query({
  args: {},
  handler: async (ctx: SellerQueryCtx) => {
    const membership = await requireSellerMembership(ctx)
    const jobs = await ctx.db
      .query('sellerJobs')
      .withIndex('by_merchantId_and_status', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    return jobs
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 50)
      .map((job) => ({
        jobId: job.jobId,
        requestId: job.requestId,
        requestVersion: job.requestVersion,
        runId: job.runId,
        phaseId: job.phaseId,
        role: job.role,
        provider: job.provider,
        providerConfigRevision: job.providerConfigRevision,
        status: job.status,
        providerRunId: job.providerRunId,
        providerModel: job.providerModel,
        providerElapsedMs: job.providerElapsedMs,
        attemptCount: job.attemptCount,
        lastErrorCode: job.lastErrorCode,
        lastErrorRetryable: job.lastErrorRetryable,
        deadlineAt: job.deadlineAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }))
  },
})

export const getOwnOfferEvents = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx: SellerQueryCtx, args: { cursor: string | null }) => {
    const membership = await requireSellerMembership(ctx)
    const cursor = assertBoundedCursor(args.cursor)
    const events = await ctx.db
      .query('sellerEvents')
      .withIndex('by_merchantId_and_createdAt', (query) => query.eq('merchantId', membership.merchantId))
      .collect()
    const ordered = events
      .filter((event) => event.createdAt > cursor)
      .sort((left, right) => left.createdAt - right.createdAt)
    const page = ordered.slice(0, 50)
    return {
      events: page.map((event) => ({
        eventType: event.eventType,
        jobId: event.jobId,
        candidateId: event.candidateId,
        offerId: event.offerId,
        safeReasons: event.safeReasons,
        createdAt: event.createdAt,
      })),
      nextCursor: ordered.length > page.length && page.length > 0 ? String(page[page.length - 1].createdAt) : null,
    }
  },
})

export function asListing(value: {
  listingId: string
  merchantId: string
  version: number
  variantId: string
  condition: 'new' | 'refurbished'
  unitId: string | null
  initialQuantity: number
  referenceUnitCents: number
  operatorFloorCents: number
  diagnosticAttributes: Record<string, Attribute>
}): Listing {
  return {
    listing: { id: value.listingId, version: value.version },
    merchantId: value.merchantId,
    variantId: value.variantId,
    condition: value.condition,
    unitId: value.unitId,
    initialQuantity: value.initialQuantity,
    referenceUnitCents: value.referenceUnitCents,
    operatorFloorCents: value.operatorFloorCents,
    diagnosticAttributes: value.diagnosticAttributes,
  }
}

export function normalizeExpectedPolicy(value: unknown): Ref | null {
  if (value === null) return null
  if (typeof value !== 'object' || value === null) throw new SellerContractError('INVALID_INPUT', 'expected policy must be a reference or null')
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.version !== 'number') throw new SellerContractError('INVALID_INPUT', 'expected policy is invalid')
  return { id: record.id, version: record.version }
}
