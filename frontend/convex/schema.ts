import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const ref = v.object({ id: v.string(), version: v.number() })
const nullableString = v.union(v.string(), v.null())
const nullableNumber = v.union(v.number(), v.null())
const value = v.union(v.string(), v.number(), v.boolean(), v.array(v.string()))
const attribute = v.object({
  value: v.union(value, v.null()),
  unit: nullableString,
  provenance: v.union(v.literal('manufacturer'), v.literal('real_report'), v.literal('synthetic_demo')),
  sourceId: nullableString,
})
const attributes = v.record(v.string(), attribute)
const safeReason = v.object({
  code: v.string(),
  field: nullableString,
  message: v.string(),
})
const offerLine = v.object({
  requestLineId: v.string(),
  listing: ref,
  quantity: v.number(),
  unitCents: v.number(),
})
const fitRequirement = v.object({
  requirementId: v.string(),
  status: v.union(v.literal('satisfied'), v.literal('unmet'), v.literal('unknown')),
  strength: v.union(v.literal('hard'), v.literal('soft')),
  weight: v.number(),
})
const fitAssessment = v.object({
  hardRequirementsPassed: v.boolean(),
  coverage: nullableNumber,
  requirements: v.array(fitRequirement),
  reasons: v.array(safeReason),
})

export default defineSchema({
  merchants: defineTable({
    merchantId: v.string(),
    displayName: v.string(),
    enabled: v.boolean(),
    paused: v.boolean(),
    currentPolicyId: nullableString,
    currentPolicyVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_merchantId', ['merchantId'])
    .index('by_enabled_paused', ['enabled', 'paused']),

  memberships: defineTable({
    authTokenIdentifier: v.string(),
    merchantId: v.string(),
    role: v.union(v.literal('owner'), v.literal('operator')),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_authTokenIdentifier', ['authTokenIdentifier'])
    .index('by_merchantId', ['merchantId'])
    .index('by_authTokenIdentifier_and_merchantId', ['authTokenIdentifier', 'merchantId']),

  categoryProfiles: defineTable({
    profileId: v.string(),
    version: v.number(),
    category: v.union(
      v.literal('laptop'),
      v.literal('tech_accessory'),
      v.literal('clothing'),
      v.literal('household_accessory'),
      v.literal('small_appliance'),
    ),
    allowedConditions: v.array(v.union(v.literal('new'), v.literal('refurbished'))),
    fields: v.array(v.object({
      id: v.string(),
      label: v.string(),
      kind: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('string_array')),
      unit: nullableString,
      allowedOperators: v.array(v.string()),
      allowedValues: v.union(v.array(v.string()), v.null()),
      minimum: nullableNumber,
      maximum: nullableNumber,
    })),
    variantKeyFields: v.array(v.string()),
    compatibilityRuleId: nullableString,
    evidenceRuleId: v.string(),
    createdAt: v.number(),
  })
    .index('by_profileId_and_version', ['profileId', 'version'])
    .index('by_category', ['category']),

  products: defineTable({
    productId: v.string(),
    title: v.string(),
    category: v.union(
      v.literal('laptop'),
      v.literal('tech_accessory'),
      v.literal('clothing'),
      v.literal('household_accessory'),
      v.literal('small_appliance'),
    ),
    profile: ref,
    manufacturerPartNumber: nullableString,
    syntheticProduct: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_productId', ['productId'])
    .index('by_category', ['category']),

  variants: defineTable({
    variantId: v.string(),
    productId: v.string(),
    title: v.string(),
    category: v.union(
      v.literal('laptop'),
      v.literal('tech_accessory'),
      v.literal('clothing'),
      v.literal('household_accessory'),
      v.literal('small_appliance'),
    ),
    profile: ref,
    manufacturerPartNumber: nullableString,
    attributes,
    syntheticProduct: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_variantId', ['variantId'])
    .index('by_productId', ['productId'])
    .index('by_category', ['category']),

  listingVersions: defineTable({
    listingId: v.string(),
    merchantId: v.string(),
    version: v.number(),
    variantId: v.string(),
    condition: v.union(v.literal('new'), v.literal('refurbished')),
    unitId: nullableString,
    initialQuantity: v.number(),
    referenceUnitCents: v.number(),
    operatorFloorCents: v.number(),
    diagnosticAttributes: attributes,
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_merchantId_and_enabled', ['merchantId', 'enabled'])
    .index('by_listingId_and_version', ['listingId', 'version'])
    .index('by_variantId_and_merchantId', ['variantId', 'merchantId']),

  policyVersions: defineTable({
    policyId: v.string(),
    merchantId: v.string(),
    version: v.number(),
    enabled: v.boolean(),
    maxDiscountBps: v.number(),
    unitCostByListing: v.record(v.string(), v.number()),
    minimumContributionByListing: v.record(v.string(), v.number()),
    costsAreSynthetic: v.boolean(),
    shippingCents: v.number(),
    arrivalCalendarDays: v.number(),
    warrantyMonths: v.number(),
    returnDays: v.number(),
    createdAt: v.number(),
  })
    .index('by_merchantId_and_version', ['merchantId', 'version'])
    .index('by_policyId_and_version', ['policyId', 'version']),

  sellerJobs: defineTable({
    jobId: v.string(),
    requestId: v.string(),
    requestVersion: v.number(),
    runId: v.string(),
    phaseId: v.string(),
    merchantId: v.string(),
    candidateIds: v.array(v.string()),
    policyId: v.string(),
    policyVersion: v.number(),
    profileVersions: v.record(v.string(), v.number()),
    role: v.union(v.literal('seller_initial'), v.literal('seller_response'), v.literal('seller_final')),
    provider: v.union(v.literal('fixture'), v.literal('fetch'), v.literal('creao')),
    providerConfigRevision: v.string(),
    inputDigest: v.string(),
    inputRef: v.string(),
    deadlineAt: v.number(),
    status: v.union(
      v.literal('created'),
      v.literal('starting'),
      v.literal('pending'),
      v.literal('polling'),
      v.literal('ambiguous'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('cancelled'),
      v.literal('stale'),
    ),
    providerRunId: nullableString,
    providerModel: nullableString,
    providerElapsedMs: nullableNumber,
    attemptCount: v.number(),
    lastErrorCode: nullableString,
    lastErrorRetryable: v.union(v.boolean(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_jobId', ['jobId'])
    .index('by_merchantId_and_status', ['merchantId', 'status'])
    .index('by_providerRunId', ['providerRunId'])
    .index('by_runId_and_phaseId', ['runId', 'phaseId']),

  sellerJobInputs: defineTable({
    jobId: v.string(),
    brief: v.any(),
    briefDigest: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_jobId', ['jobId']),

  candidates: defineTable({
    candidateId: v.string(),
    jobId: v.string(),
    merchantId: v.string(),
    status: v.union(v.literal('open'), v.literal('accepted'), v.literal('held'), v.literal('abstained'), v.literal('closed')),
    currentOfferId: nullableString,
    currentOfferVersion: nullableNumber,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_jobId_and_merchantId', ['jobId', 'merchantId'])
    .index('by_candidateId', ['candidateId']),

  offerVersions: defineTable({
    offerId: v.string(),
    version: v.number(),
    jobId: v.string(),
    candidateId: v.string(),
    merchantId: v.string(),
    parentOffer: v.union(ref, v.null()),
    policy: ref,
    lines: v.array(offerLine),
    itemsCents: v.number(),
    shippingCents: v.number(),
    totalCents: v.number(),
    arrivalCalendarDays: v.number(),
    warrantyMonths: v.number(),
    returnDays: v.number(),
    fit: fitAssessment,
    claims: v.array(v.object({ id: v.string(), requestLineId: v.string(), text: v.string(), sourceIds: v.array(v.string()) })),
    status: v.union(v.literal('accepted'), v.literal('rejected'), v.literal('hold')),
    mode: v.union(v.literal('fixture'), v.literal('live'), v.literal('cached'), v.literal('simulation'), v.literal('visa_sandbox')),
    createdAt: v.number(),
  })
    .index('by_jobId_and_merchantId', ['jobId', 'merchantId'])
    .index('by_merchantId_and_createdAt', ['merchantId', 'createdAt'])
    .index('by_candidateId_and_version', ['candidateId', 'version'])
    .index('by_offerId_and_version', ['offerId', 'version']),

  fitAssessments: defineTable({
    offerId: v.string(),
    offerVersion: v.number(),
    merchantId: v.string(),
    assessment: fitAssessment,
    createdAt: v.number(),
  })
    .index('by_offerId_and_version', ['offerId', 'offerVersion'])
    .index('by_merchantId', ['merchantId']),

  reservations: defineTable({
    reservationKey: v.string(),
    requestId: v.string(),
    quoteId: v.string(),
    merchantId: v.string(),
    status: v.union(v.literal('reserved'), v.literal('execution_locked'), v.literal('released'), v.literal('sold')),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_reservationKey', ['reservationKey'])
    .index('by_requestId_and_status', ['requestId', 'status'])
    .index('by_merchantId_and_status', ['merchantId', 'status']),

  allocations: defineTable({
    allocationId: v.string(),
    reservationKey: v.string(),
    requestId: v.string(),
    quoteId: v.string(),
    merchantId: v.string(),
    requestLineId: v.string(),
    listingId: v.string(),
    listingVersion: v.number(),
    quantity: v.number(),
    unitCents: v.number(),
    state: v.union(v.literal('reserved'), v.literal('execution_locked'), v.literal('sold'), v.literal('released')),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_allocationId', ['allocationId'])
    .index('by_listingId_and_state', ['listingId', 'state'])
    .index('by_reservationKey', ['reservationKey'])
    .index('by_requestId', ['requestId']),

  sellerEvents: defineTable({
    merchantId: v.string(),
    eventType: v.union(
      v.literal('listing_published'),
      v.literal('policy_published'),
      v.literal('merchant_paused'),
      v.literal('merchant_resumed'),
      v.literal('proposal_received'),
      v.literal('proposal_rejected'),
      v.literal('offer_accepted'),
      v.literal('allocation_changed'),
      v.literal('provider_started'),
      v.literal('provider_pending'),
      v.literal('provider_completed'),
      v.literal('provider_failed'),
      v.literal('provider_ambiguous'),
      v.literal('provider_cancelled'),
    ),
    jobId: nullableString,
    candidateId: nullableString,
    offerId: nullableString,
    safeReasons: v.array(safeReason),
    payloadDigest: v.string(),
    createdAt: v.number(),
  })
    .index('by_merchantId_and_createdAt', ['merchantId', 'createdAt'])
    .index('by_jobId_and_createdAt', ['jobId', 'createdAt']),

  seedRuns: defineTable({
    seedRevision: v.string(),
    mode: v.literal('fixture'),
    createdAt: v.number(),
  }).index('by_seedRevision', ['seedRevision']),
})
