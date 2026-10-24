import { z } from 'zod'

// Application contracts only. Authentication, profile rules and current-state
// checks belong to the server; parsing a payload never grants authority.
const id = z.string().min(1).max(128)
const text = z.string().max(4000)
const cents = z.int().nonnegative()
const ms = z.int().nonnegative()
const version = z.int().min(1)
const quantity = z.int().min(1).max(10)
const ref = z.strictObject({ id, version })
const category = z.enum(['laptop', 'tech_accessory', 'clothing', 'household_accessory', 'small_appliance'])
const condition = z.enum(['new', 'refurbished'])
const sort = z.enum(['best_fit', 'cheapest', 'soonest', 'warranty'])
const value = z.union([text, z.number().finite(), z.boolean(), z.array(text).max(100)])
const operator = z.enum(['equals', 'in', 'min', 'max', 'containsAll'])
const requirement = z.strictObject({
  id, fieldId: id, operator, value, unit: id.nullable(),
  strength: z.enum(['hard', 'soft']), weight: z.union([z.literal(1), z.literal(2)]),
})
const line = z.strictObject({
  lineId: id, role: z.enum(['primary', 'related']), category, profile: ref,
  quantity, allowedConditions: z.array(condition).min(1).max(2),
  requirements: z.array(requirement).max(100), useCaseSummary: text,
})
const lines = z.array(line).min(1).max(3)
const sharedTarget = z.strictObject({ amountCents: cents.positive(), consentId: id, consentedAt: ms })
const brief = z.strictObject({
  schemaVersion: z.literal(1), request: ref, currency: z.literal('USD'),
  deliveryRegion: z.literal('US-CA-SAN_FRANCISCO'), deliveryDeadline: ms,
  lines, sharedTarget: sharedTarget.nullable(),
})
const origin = z.strictObject({
  requirementId: id, messageId: id, start: z.int().nonnegative(), end: z.int().nonnegative(),
  explicit: z.boolean(), buyerConfirmed: z.boolean(),
})
const request = z.strictObject({
  schemaVersion: z.literal(1), request: ref, ownerId: id, createdAt: ms,
  rawMessages: z.array(z.strictObject({ id, text })).max(100),
  origins: z.array(origin).max(300), privateMaximumCents: cents.positive(),
  confirmedAt: ms, sort, brief,
})
const check = z.strictObject({
  requirementId: id, status: z.enum(['matched', 'unmet', 'unknown']),
  actual: value.nullable(), sourceIds: z.array(id).max(40), explanation: text,
})
const fit = z.strictObject({
  checks: z.array(check).max(300), coveragePercent: z.number().min(0).max(100).nullable(),
  hardRequirementsPass: z.boolean(), scoringVersion: z.literal(1),
})
const evidenceStatus = z.enum(['pending', 'complete', 'partial', 'unavailable', 'cached'])
const offerLine = z.strictObject({ requestLineId: id, listing: ref, quantity, unitCents: cents })
const claim = z.strictObject({ id, requestLineId: id, text, sourceIds: z.array(id).max(40) })
const offer = z.strictObject({
  offer: ref, candidateId: id, request: ref, runId: id, merchantId: id, policy: ref,
  lines: z.array(offerLine).min(1).max(3), claims: z.array(claim).max(100),
  fitArgument: text, fit, itemsCents: cents, shippingCents: cents, taxCents: z.literal(0),
  totalCents: cents, arrivalAt: ms, warrantyMonths: z.int().nonnegative().max(1200),
  returnDays: z.int().nonnegative().max(3650), acceptedAt: ms, expiresAt: ms,
  policyValid: z.boolean(), requirementsValidExceptBudget: z.boolean(),
  affordable: z.boolean(), selectable: z.boolean(),
})
const card = z.strictObject({
  offer: ref, merchant: z.strictObject({ id, displayName: text, demo: z.literal(true) }),
  products: z.array(z.strictObject({
    requestLineId: id, variantId: id, title: text, condition, quantity,
  })).min(1).max(3),
  totalCents: cents, initialTotalCents: cents, currency: z.literal('USD'), arrivalAt: ms,
  warrantyMonths: z.int().nonnegative().max(1200), returnDays: z.int().nonnegative().max(3650),
  fit, fitArgument: text, mainConcern: text.nullable(), evidenceStatus,
  evidenceIds: z.array(id).max(200), expiresAt: ms, selectable: z.boolean(),
  unavailableReason: text.nullable(),
})
const apiError = z.strictObject({
  code: z.enum(['INVALID_INPUT', 'FORBIDDEN', 'STALE_VERSION', 'NO_MATCH', 'POLICY_REJECTED',
    'EXPIRED', 'STOCK_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'LIMIT_REACHED', 'EXECUTION_UNKNOWN']),
  message: text, retryable: z.boolean(), correlationId: id,
})
const event = z.strictObject({
  id, request: ref, runId: id, sequence: z.int().nonnegative(), createdAt: ms,
  kind: z.enum(['started', 'proposal', 'rejected', 'challenge', 'response', 'revision',
    'price_round_opened', 'final_bid', 'abstained', 'price_round_skipped', 'research_updated', 'closed']),
  merchantId: id.nullable(), offer: ref.nullable(), summary: text,
})
const intake = z.strictObject({
  expectedDraftVersion: version, proposedLines: lines.nullable(), proposedDeadline: ms.nullable(),
  proposedPrivateMaximumCents: cents.positive().nullable(), proposedSharedTargetCents: cents.positive().nullable(),
  origins: z.array(origin).max(300), clarificationQuestions: z.array(text).max(10),
  suggestedReplies: z.array(z.strictObject({ id, label: text, text })).max(10),
  unresolvedFields: z.array(id).max(100),
})

// This registry is the single source for inferred types and the generated JSON
// Schema consumed by workers. No vendor-specific payload belongs here.
export const contracts = {
  Ref: ref,
  CategoryProfile: z.strictObject({
    profile: ref, category, allowedConditions: z.array(condition).min(1).max(2),
    fields: z.array(z.strictObject({
      id, label: text, kind: z.enum(['string', 'number', 'boolean', 'string_array']),
      unit: id.nullable(), allowedOperators: z.array(operator).min(1).max(5),
      allowedValues: z.array(text).max(100).nullable(), minimum: z.number().finite().nullable(),
      maximum: z.number().finite().nullable(),
    })).max(100),
    variantKeyFields: z.array(id).max(100), compatibilityRuleId: id.nullable(), evidenceRuleId: id,
  }),
  Requirement: requirement,
  RequestLine: line,
  ConfirmedBrief: brief,
  SellerBrief: brief.extend({ runId: id }),
  RequestVersion: request,
  FitAssessment: fit,
  OfferVersion: offer,
  OfferCard: card,
  ApiError: apiError,
  IntakeResult: intake,
  DraftView: z.strictObject({
    requestId: id, draftVersion: version,
    messages: z.array(z.strictObject({ id, role: z.enum(['buyer', 'assistant']), text, createdAt: ms })).max(100),
    interpretation: intake.nullable(), confirmedRequest: ref.nullable(), updatedAt: ms,
  }),
  RunEvent: event,
  BuyerRunView: z.strictObject({
    request: ref, runId: id,
    stage: z.enum(['bidding', 'council', 'negotiating', 'researching', 'results', 'no_match', 'cancelled', 'failed']),
    purchaseStage: z.enum(['none', 'reserved', 'executing', 'unknown', 'complete', 'declined']),
    startedAt: ms, updatedAt: ms, serverNow: ms,
    participatingMerchantCount: z.int().min(0).max(3), completedMerchantCount: z.int().min(0).max(3),
    evidenceStatus, partial: z.boolean(), offers: z.array(card).max(5), events: z.array(event).max(100),
    suggestedActions: z.array(z.strictObject({ id, label: text, kind: z.enum(['compare_offers', 'revise_request']) })).max(10),
    allowedActions: z.array(z.enum(['cancel', 'revise', 'select', 'approve', 'retry'])).max(5),
    modes: z.strictObject({ inventory: z.literal('mock'), agents: z.enum(['live', 'fixture', 'mixed']),
      evidence: z.enum(['live', 'cached', 'mixed', 'unavailable']), payment: z.enum(['simulation', 'visa_sandbox']) }),
    error: apiError.nullable(),
  }),
  SellerProposal: z.strictObject({
    schemaVersion: z.literal(1), jobId: id, candidateId: id, parentOffer: ref.nullable(), policy: ref,
    lines: z.array(offerLine).min(1).max(3), claims: z.array(claim).max(100), fitArgument: text,
    privatePriceRationale: text,
  }),
  Evidence: z.strictObject({
    id, variantId: id, applicability: z.enum(['exact_variant', 'family']),
    sourceType: z.enum(['manufacturer', 'independent_test', 'owner_report']),
    url: z.url().max(2048), sourceDate: z.string().max(100).nullable(), retrievedAt: ms,
    claim: text, excerpt: text, sourceVerifiedPurchaseLabel: text.nullable(),
    verification: z.enum(['supported', 'contradicted', 'unknown']), providerRunId: id,
    providerBuild: id, duplicateGroup: id,
  }),
  FirmQuote: z.strictObject({
    quoteId: id, request: ref, offer: ref, merchantId: id, policy: ref,
    lines: z.array(offerLine).min(1).max(3), totalCents: cents, shippingCents: cents,
    taxCents: z.literal(0), currency: z.literal('USD'), arrivalAt: ms,
    warrantyMonths: z.int().nonnegative().max(1200), returnDays: z.int().nonnegative().max(3650),
    createdAt: ms, expiresAt: ms, quoteHash: id, reservationId: id,
    paymentMode: z.enum(['simulation', 'visa_sandbox']), operation: id,
  }),
  ExecutionView: z.strictObject({
    executionId: id, quoteId: id, status: z.enum(['pending', 'unknown', 'succeeded', 'declined']),
    mode: z.enum(['simulation', 'visa_sandbox']), operation: id,
    providerReference: id.nullable(), orderId: id.nullable(), resultMessage: text,
    nextAction: z.enum(['wait', 'choose_offer', 'none']),
  }),
  ChallengePlan: z.strictObject({ challenges: z.array(z.strictObject({offer:ref,claimId:id,question:text,sourceIds:z.array(id).max(40)})).max(3), summary:text }),
  EvidenceSummary: z.strictObject({variantId:id,positives:z.array(z.strictObject({text,evidenceIds:z.array(id).max(40)})).max(20),concerns:z.array(z.strictObject({text,evidenceIds:z.array(id).max(40)})).max(20),gaps:z.array(text).max(40)}),
  PriceRound: z.strictObject({id,request:ref,runId:id,mode:z.enum(['competitive','single_seller_target']),participants:z.array(z.strictObject({merchantId:id,candidateId:id,initialOffer:ref})).min(1).max(6),openedAt:ms,deadlineAt:ms,status:z.enum(['open','closed']),closeReason:z.enum(['all_responded','deadline','cancelled']).nullable()}),
  FinalSubmission: z.strictObject({roundId:id,candidateId:id,jobId:id,payloadDigest:id,receivedAt:ms,decision:z.enum(['revise','hold','abstain']),validatedOffer:ref.nullable()}),
  Reservation: z.strictObject({id,request:ref,quoteId:id,ownerId:id,createdAt:ms,expiresAt:ms,state:z.enum(['active','execution_locked','released','sold']),executionId:id.nullable()}),
  Allocation: z.strictObject({id,reservationId:id,listingId:id,quantity}),
  SaveDraftInput: z.strictObject({ requestId: id.nullable(), expectedDraftVersion: version.nullable(), message: text.min(1) }),
  ConfirmRequestInput: z.strictObject({
    requestId: id, expectedDraftVersion: version, lines, deliveryDeadline: ms,
    privateMaximumCents: cents.positive(), sharedTargetCents: cents.positive().nullable(), shareTarget: z.boolean(), sort,
  }),
} as const

export type ContractName = keyof typeof contracts
export type Contract<N extends ContractName> = z.infer<(typeof contracts)[N]>
export type RequestVersion = Contract<'RequestVersion'>
export type SellerBrief = Contract<'SellerBrief'>
export type OfferCard = Contract<'OfferCard'>
export type ApiError = Contract<'ApiError'>
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }
