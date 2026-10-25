import {
  type Attribute,
  type CatalogSnapshot,
  type Cents,
  type FinalOfferCandidate,
  type FinalOfferValidationContext,
  type FinalServiceTerms,
  type FitAssessment,
  type OfferLine,
  type OfferVersion,
  type PricingPolicy,
  type Requirement,
  type RequirementResult,
  type RequestLine,
  type SafeReason,
  type SellerProposal,
  type SellerValidationContext,
  type SellerValidationResult,
  safeReason,
  SellerContractError,
} from './sellerContracts.ts'

const BASIS_POINTS = 10_000
const MAX_DISCOUNT_BPS = BASIS_POINTS
const MAX_QUANTITY = 10
const MAX_CENTS = Number.MAX_SAFE_INTEGER
const MAX_FINAL_SERVICE_OPTIONS = 8
const MAX_ID_LENGTH = 128
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

type NumericUnit = { family: string; multiplier: number }

const NUMERIC_UNITS: Record<string, NumericUnit> = {
  GB: { family: 'storage', multiplier: 1 },
  TB: { family: 'storage', multiplier: 1_024 },
  g: { family: 'mass', multiplier: 1 },
  kg: { family: 'mass', multiplier: 1_000 },
  mm: { family: 'length', multiplier: 1 },
  cm: { family: 'length', multiplier: 10 },
  m: { family: 'length', multiplier: 1_000 },
  ml: { family: 'volume', multiplier: 0.001 },
  L: { family: 'volume', multiplier: 1 },
  V: { family: 'voltage', multiplier: 1 },
  Hz: { family: 'frequency', multiplier: 1 },
  '%': { family: 'percentage', multiplier: 1 },
}

function isSafeCents(value: unknown, minimum = 0): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= MAX_CENTS
}

function checkedAdd(...values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(total) || total > MAX_CENTS) {
    throw new SellerContractError('INVALID_INPUT', 'money calculation overflowed safe integer bounds')
  }
  return total
}

function checkedMultiply(left: number, right: number): number {
  const result = left * right
  if (!Number.isSafeInteger(result) || result > MAX_CENTS) {
    throw new SellerContractError('INVALID_INPUT', 'money calculation overflowed safe integer bounds')
  }
  return result
}

function ceilDivide(numerator: number, denominator: number): number {
  const result = Math.floor(numerator / denominator) + (numerator % denominator === 0 ? 0 : 1)
  if (!Number.isSafeInteger(result) || result > MAX_CENTS) {
    throw new SellerContractError('INVALID_INPUT', 'minimum price calculation overflowed safe integer bounds')
  }
  return result
}

export function minimumUnitCents(input: {
  referenceUnitCents: Cents
  operatorFloorCents: Cents
  maxDiscountBps: number
  unitCostCents: Cents
  minimumContributionCents: Cents
}): Cents {
  if (!isSafeCents(input.referenceUnitCents) || !isSafeCents(input.operatorFloorCents)) {
    throw new SellerContractError('INVALID_INPUT', 'reference and floor prices must be non-negative safe cents')
  }
  if (!Number.isSafeInteger(input.maxDiscountBps) || input.maxDiscountBps < 0 || input.maxDiscountBps > MAX_DISCOUNT_BPS) {
    throw new SellerContractError('INVALID_INPUT', 'discount cap must be between 0 and 10000 basis points')
  }
  if (!isSafeCents(input.unitCostCents) || !isSafeCents(input.minimumContributionCents)) {
    throw new SellerContractError('INVALID_INPUT', 'cost and contribution must be non-negative safe cents')
  }
  const discountBound = ceilDivide(
    checkedMultiply(input.referenceUnitCents, BASIS_POINTS - input.maxDiscountBps),
    BASIS_POINTS,
  )
  const contributionBound = checkedAdd(input.unitCostCents, input.minimumContributionCents)
  return Math.max(input.operatorFloorCents, discountBound, contributionBound)
}

export interface PolicyChanges {
  enabled?: boolean
  maxDiscountBps?: number
  unitCostByListing?: Record<string, Cents>
  minimumContributionByListing?: Record<string, Cents>
  costsAreSynthetic?: boolean
  shippingCents?: Cents
  arrivalCalendarDays?: number
  warrantyMonths?: number
  returnDays?: number
  finalServiceOptions?: PricingPolicy['finalServiceOptions']
}

export function validatePolicyValues(policy: PricingPolicy): SafeReason[] {
  const reasons: SafeReason[] = []
  if (!Number.isSafeInteger(policy.maxDiscountBps) || policy.maxDiscountBps < 0 || policy.maxDiscountBps > MAX_DISCOUNT_BPS) {
    reasons.push(safeReason('INVALID_INPUT', 'discount cap must be between 0 and 10000 basis points', 'maxDiscountBps'))
  }
  if (!isSafeCents(policy.shippingCents)) {
    reasons.push(safeReason('INVALID_INPUT', 'shipping must be non-negative integer cents', 'shippingCents'))
  }
  for (const [listingId, value] of Object.entries(policy.unitCostByListing)) {
    if (!isSafeCents(value)) reasons.push(safeReason('INVALID_INPUT', 'unit cost must be non-negative integer cents', `unitCostByListing.${listingId}`))
  }
  for (const [listingId, value] of Object.entries(policy.minimumContributionByListing)) {
    if (!isSafeCents(value)) reasons.push(safeReason('INVALID_INPUT', 'minimum contribution must be non-negative integer cents', `minimumContributionByListing.${listingId}`))
  }
  if (!Number.isSafeInteger(policy.arrivalCalendarDays) || policy.arrivalCalendarDays < 0 || policy.arrivalCalendarDays > 365) {
    reasons.push(safeReason('INVALID_INPUT', 'arrival days must be an integer from 0 to 365', 'arrivalCalendarDays'))
  }
  if (!Number.isSafeInteger(policy.warrantyMonths) || policy.warrantyMonths < 0 || policy.warrantyMonths > 120) {
    reasons.push(safeReason('INVALID_INPUT', 'warranty months must be an integer from 0 to 120', 'warrantyMonths'))
  }
  if (!Number.isSafeInteger(policy.returnDays) || policy.returnDays < 0 || policy.returnDays > 365) {
    reasons.push(safeReason('INVALID_INPUT', 'return days must be an integer from 0 to 365', 'returnDays'))
  }
  if (!Array.isArray(policy.finalServiceOptions) || policy.finalServiceOptions.length > MAX_FINAL_SERVICE_OPTIONS) {
    reasons.push(safeReason('INVALID_INPUT', 'final service options must contain at most eight options', 'finalServiceOptions'))
  } else {
    const optionIds = new Set<string>()
    policy.finalServiceOptions.forEach((option, index) => {
      const field = `finalServiceOptions.${index}`
      if (
        typeof option.id !== 'string' ||
        option.id.length === 0 ||
        option.id.length > MAX_ID_LENGTH ||
        !SAFE_ID_PATTERN.test(option.id)
      ) {
        reasons.push(safeReason('INVALID_INPUT', 'service option ID is invalid', `${field}.id`))
      } else if (optionIds.has(option.id)) {
        reasons.push(safeReason('INVALID_INPUT', 'service option IDs must be unique', `${field}.id`))
      } else {
        optionIds.add(option.id)
      }
      if (!isSafeCents(option.shippingCents)) {
        reasons.push(safeReason('INVALID_INPUT', 'service option shipping must be non-negative integer cents', `${field}.shippingCents`))
      }
      if (!Number.isSafeInteger(option.arrivalCalendarDays) || option.arrivalCalendarDays < 0 || option.arrivalCalendarDays > 365) {
        reasons.push(safeReason('INVALID_INPUT', 'service option arrival days must be an integer from 0 to 365', `${field}.arrivalCalendarDays`))
      }
      if (!Number.isSafeInteger(option.warrantyMonths) || option.warrantyMonths < 0 || option.warrantyMonths > 120) {
        reasons.push(safeReason('INVALID_INPUT', 'service option warranty months must be an integer from 0 to 120', `${field}.warrantyMonths`))
      }
      if (!Number.isSafeInteger(option.returnDays) || option.returnDays < 0 || option.returnDays > 365) {
        reasons.push(safeReason('INVALID_INPUT', 'service option return days must be an integer from 0 to 365', `${field}.returnDays`))
      }
      if (!isSafeCents(option.incrementalCostCents)) {
        reasons.push(safeReason('INVALID_INPUT', 'incremental bundle cost must be non-negative integer cents', `${field}.incrementalCostCents`))
      }
    })
  }
  return reasons
}

export function applyPolicyChanges(current: PricingPolicy, changes: PolicyChanges, nextVersion: number): PricingPolicy {
  if (!Number.isSafeInteger(nextVersion) || nextVersion < 1) {
    throw new SellerContractError('INVALID_INPUT', 'policy version must be a positive integer')
  }
  const next: PricingPolicy = {
    ...current,
    policy: { id: current.policy.id, version: nextVersion },
    enabled: changes.enabled ?? current.enabled,
    maxDiscountBps: changes.maxDiscountBps ?? current.maxDiscountBps,
    unitCostByListing: changes.unitCostByListing ? { ...changes.unitCostByListing } : { ...current.unitCostByListing },
    minimumContributionByListing: changes.minimumContributionByListing
      ? { ...changes.minimumContributionByListing }
      : { ...current.minimumContributionByListing },
    costsAreSynthetic: changes.costsAreSynthetic ?? current.costsAreSynthetic,
    shippingCents: changes.shippingCents ?? current.shippingCents,
    arrivalCalendarDays: changes.arrivalCalendarDays ?? current.arrivalCalendarDays,
    warrantyMonths: changes.warrantyMonths ?? current.warrantyMonths,
    returnDays: changes.returnDays ?? current.returnDays,
    finalServiceOptions: changes.finalServiceOptions
      ? changes.finalServiceOptions.map((option) => ({ ...option }))
      : current.finalServiceOptions.map((option) => ({ ...option })),
  }
  const reasons = validatePolicyValues(next)
  if (reasons.length) {
    throw new SellerContractError('INVALID_INPUT', reasons[0].message, reasons[0].field)
  }
  return next
}

export function resolveFinalServiceTerms(
  policy: PricingPolicy,
  serviceOptionId: string | null,
): FinalServiceTerms {
  const policyReasons = validatePolicyValues(policy)
  if (policyReasons.length) {
    throw new SellerContractError('INVALID_INPUT', policyReasons[0].message, policyReasons[0].field)
  }
  if (serviceOptionId === null) {
    return {
      serviceOptionId: null,
      shippingCents: policy.shippingCents,
      arrivalCalendarDays: policy.arrivalCalendarDays,
      warrantyMonths: policy.warrantyMonths,
      returnDays: policy.returnDays,
      incrementalCostCents: 0,
    }
  }
  if (
    typeof serviceOptionId !== 'string' ||
    serviceOptionId.length === 0 ||
    serviceOptionId.length > MAX_ID_LENGTH ||
    !SAFE_ID_PATTERN.test(serviceOptionId)
  ) {
    throw new SellerContractError('INVALID_INPUT', 'service option ID is invalid', 'serviceOptionId')
  }
  const option = policy.finalServiceOptions.find((candidate) => candidate.id === serviceOptionId)
  if (!option) {
    throw new SellerContractError('INVALID_INPUT', 'service option is not authorized by policy', 'serviceOptionId')
  }
  return {
    serviceOptionId: option.id,
    shippingCents: option.shippingCents,
    arrivalCalendarDays: option.arrivalCalendarDays,
    warrantyMonths: option.warrantyMonths,
    returnDays: option.returnDays,
    incrementalCostCents: option.incrementalCostCents,
  }
}

function numericValue(value: unknown, unit: string | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (unit === null) return value
  const definition = NUMERIC_UNITS[unit]
  if (!definition) return null
  const normalized = value * definition.multiplier
  return Number.isFinite(normalized) ? normalized : null
}

/** Convert a numeric requirement between compatible canonical unit families. */
export function convertRequirementUnit(
  value: number,
  fromUnit: string | null,
  toUnit: string | null,
): number | null {
  if (!Number.isFinite(value)) return null
  if (fromUnit === toUnit) return value
  const from = fromUnit === null ? null : NUMERIC_UNITS[fromUnit]
  const to = toUnit === null ? null : NUMERIC_UNITS[toUnit]
  if (!from || !to || from.family !== to.family) return null
  const converted = value * from.multiplier / to.multiplier
  return Number.isFinite(converted) ? converted : null
}

function compareNumeric(
  attribute: Attribute,
  requirementValue: number,
  requirementUnit: string | null,
  operator: 'min' | 'max',
): 'satisfied' | 'unmet' | 'unknown' {
  if (attribute.value === null) return 'unknown'
  if (typeof attribute.value !== 'number') return 'unknown'
  const actualDefinition = attribute.unit === null ? null : NUMERIC_UNITS[attribute.unit]
  const expectedDefinition = requirementUnit === null ? null : NUMERIC_UNITS[requirementUnit]
  if (attribute.unit !== requirementUnit) {
    if (!actualDefinition || !expectedDefinition || actualDefinition.family !== expectedDefinition.family) return 'unknown'
  }
  const actual = numericValue(attribute.value, attribute.unit)
  const expected = numericValue(requirementValue, requirementUnit)
  if (actual === null || expected === null) return 'unknown'
  return operator === 'min'
    ? actual >= expected ? 'satisfied' : 'unmet'
    : actual <= expected ? 'satisfied' : 'unmet'
}

export function evaluateRequirement(requirement: Requirement, attribute: Attribute | null): RequirementResult {
  if (!attribute || attribute.value === null) {
    return { requirementId: requirement.id, status: 'unknown', strength: requirement.strength, weight: requirement.weight }
  }
  let status: RequirementResult['status'] = 'unknown'
  if (requirement.operator === 'min' || requirement.operator === 'max') {
    status = compareNumeric(attribute, requirement.value as number, requirement.unit, requirement.operator)
  } else if (requirement.operator === 'equals') {
    if (Array.isArray(attribute.value) || Array.isArray(requirement.value)) {
      status = 'unknown'
    } else if (typeof attribute.value === 'number' && typeof requirement.value === 'number') {
      status = compareNumeric(attribute, requirement.value, requirement.unit, 'min') === 'satisfied' &&
        compareNumeric(attribute, requirement.value, requirement.unit, 'max') === 'satisfied'
        ? 'satisfied'
        : 'unmet'
    } else if (attribute.unit !== requirement.unit && typeof attribute.value !== 'string') {
      status = 'unknown'
    } else {
      status = attribute.value === requirement.value ? 'satisfied' : 'unmet'
    }
  } else if (requirement.operator === 'in') {
    if (!Array.isArray(requirement.value) || requirement.value.some((value) => typeof value !== 'string')) {
      status = 'unknown'
    } else if (Array.isArray(attribute.value)) {
      status = 'unknown'
    } else {
      status = requirement.value.includes(String(attribute.value)) ? 'satisfied' : 'unmet'
    }
  } else if (requirement.operator === 'containsAll') {
    if (!Array.isArray(requirement.value) || requirement.value.some((value) => typeof value !== 'string')) {
      status = 'unknown'
    } else if (!Array.isArray(attribute.value) || attribute.value.some((value) => typeof value !== 'string')) {
      status = 'unknown'
    } else {
      const actualValues = attribute.value
      status = requirement.value.every((value) => actualValues.includes(value)) ? 'satisfied' : 'unmet'
    }
  }
  return { requirementId: requirement.id, status, strength: requirement.strength, weight: requirement.weight }
}

function attributeFor(snapshot: CatalogSnapshot, fieldId: string): Attribute | null {
  return snapshot.variant.attributes[fieldId] ?? snapshot.listing.diagnosticAttributes[fieldId] ?? null
}

export function assessLine(
  line: RequestLine,
  snapshot: CatalogSnapshot,
): FitAssessment {
  const reasons: SafeReason[] = []
  if (snapshot.variant.category !== line.category) {
    reasons.push(safeReason('UNSUPPORTED_CATEGORY', 'listing category does not match the requested category', 'category'))
  }
  if (snapshot.variant.profile.id !== line.profile.id || snapshot.variant.profile.version !== line.profile.version) {
    reasons.push(safeReason('PROFILE_MISMATCH', 'listing profile is not the pinned request profile', 'profile'))
  }
  if (!line.allowedConditions.includes(snapshot.listing.condition)) {
    reasons.push(safeReason('CONDITION_NOT_ALLOWED', 'listing condition is not allowed for this request line', 'condition'))
  }
  const requirements: RequirementResult[] = line.requirements.map((requirement) => {
    const result = evaluateRequirement(requirement, attributeFor(snapshot, requirement.fieldId))
    if (requirement.strength === 'hard' && result.status === 'unknown') {
      reasons.push(safeReason('UNKNOWN_REQUIRED_FACT', 'a required product fact is unavailable or has incompatible units', requirement.fieldId))
    } else if (requirement.strength === 'hard' && result.status === 'unmet') {
      reasons.push(safeReason('REQUIREMENT_NOT_MET', 'listing does not satisfy a hard requirement', requirement.fieldId))
    }
    return result
  })
  const hardRequirementsPassed = requirements.every(
    (requirement) => requirement.strength !== 'hard' || requirement.status === 'satisfied',
  ) && reasons.every((reason) => !['UNSUPPORTED_CATEGORY', 'PROFILE_MISMATCH', 'CONDITION_NOT_ALLOWED'].includes(reason.code))
  const soft = requirements.filter((requirement) => requirement.strength === 'soft' && requirement.status !== 'unknown')
  const softWeight = soft.reduce((sum, requirement) => sum + requirement.weight, 0)
  const softMatches = soft.reduce(
    (sum, requirement) => sum + (requirement.status === 'satisfied' ? requirement.weight : 0),
    0,
  )
  const coverage = softWeight === 0 ? null : Math.round((100 * softMatches) / softWeight)
  return { hardRequirementsPassed, coverage, requirements, reasons }
}

export function weightedCoverage(assessment: FitAssessment | RequirementResult[]): number | null {
  const requirements = Array.isArray(assessment) ? assessment : assessment.requirements
  const known = requirements.filter((requirement) => requirement.status !== 'unknown')
  const total = known.reduce((sum, requirement) => sum + requirement.weight, 0)
  if (total === 0) return null
  const matched = known.reduce((sum, requirement) => sum + (requirement.status === 'satisfied' ? requirement.weight : 0), 0)
  return Math.round((matched * 100) / total)
}

function findSnapshotInCatalog(catalog: CatalogSnapshot[], line: OfferLine): CatalogSnapshot | null {
  return catalog.find(
    (snapshot) =>
      snapshot.listing.listing.id === line.listing.id &&
      snapshot.listing.listing.version === line.listing.version,
  ) ?? null
}

function findSnapshot(context: SellerValidationContext, line: OfferLine): CatalogSnapshot | null {
  return findSnapshotInCatalog(context.catalog, line)
}

function policyForListing(policy: PricingPolicy, listingId: string): { cost: Cents; contribution: Cents } | null {
  const cost = policy.unitCostByListing[listingId]
  const contribution = policy.minimumContributionByListing[listingId]
  return isSafeCents(cost) && isSafeCents(contribution) ? { cost, contribution } : null
}

export function validateSellerProposal(
  context: SellerValidationContext,
  proposal: SellerProposal,
): SellerValidationResult {
  const reasons: SafeReason[] = []
  if (proposal.jobId !== context.jobId) reasons.push(safeReason('WRONG_JOB_SCOPE', 'proposal is bound to a different seller job', 'jobId'))
  if (!context.candidates.includes(proposal.candidateId)) reasons.push(safeReason('WRONG_JOB_SCOPE', 'candidate is not scoped to this seller job', 'candidateId'))
  if (proposal.policy.id !== context.policy.policy.id || proposal.policy.version !== context.policy.policy.version) {
    reasons.push(safeReason('POLICY_VERSION_STALE', 'proposal policy version is no longer current', 'policy'))
  }
  if (!context.policy.enabled) reasons.push(safeReason('POLICY_DISABLED', 'merchant policy is disabled', 'policy'))
  if (proposal.lines.length > context.brief.lines.length) reasons.push(safeReason('TOO_MANY_LINES', 'proposal contains more lines than the seller brief', 'lines'))
  const seen = new Set<string>()
  let itemsCents = 0
  const offerLines: OfferLine[] = []
  let combinedFit: FitAssessment = {
    hardRequirementsPassed: true,
    coverage: null,
    requirements: [],
    reasons: [],
  }
  for (const line of proposal.lines) {
    if (seen.has(line.requestLineId)) {
      reasons.push(safeReason('DUPLICATE_LINE', 'proposal repeats a request line', `lines.${line.requestLineId}`))
      continue
    }
    seen.add(line.requestLineId)
    const requestLine = context.brief.lines.find((candidate) => candidate.lineId === line.requestLineId)
    if (!requestLine) {
      reasons.push(safeReason('MISSING_LINE', 'proposal references an unknown request line', `lines.${line.requestLineId}`))
      continue
    }
    if (line.quantity !== requestLine.quantity || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      reasons.push(safeReason('QUANTITY_INVALID', 'proposal quantity must exactly satisfy the request line', `lines.${line.requestLineId}.quantity`))
    }
    const snapshot = findSnapshot(context, line)
    if (!snapshot) {
      reasons.push(safeReason('LISTING_VERSION_STALE', 'listing version is not in the server job snapshot', `lines.${line.requestLineId}.listing`))
      continue
    }
    if (snapshot.listing.merchantId !== context.merchantId) {
      reasons.push(safeReason('WRONG_MERCHANT_SCOPE', 'listing is not owned by the authenticated seller job', `lines.${line.requestLineId}.listing`))
    }
    if (line.quantity > snapshot.availableQuantity) {
      reasons.push(safeReason('QUANTITY_UNAVAILABLE', 'listing does not have enough available units', `lines.${line.requestLineId}.quantity`))
    }
    const policy = policyForListing(context.policy, snapshot.listing.listing.id)
    if (!policy) {
      reasons.push(safeReason('INVALID_INPUT', 'policy does not contain cost and contribution for this listing', `policy.${snapshot.listing.listing.id}`))
      continue
    }
    const minimum = minimumUnitCents({
      referenceUnitCents: snapshot.listing.referenceUnitCents,
      operatorFloorCents: snapshot.listing.operatorFloorCents,
      maxDiscountBps: context.policy.maxDiscountBps,
      unitCostCents: policy.cost,
      minimumContributionCents: policy.contribution,
    })
    if (line.unitCents < minimum) reasons.push(safeReason('PRICE_BELOW_FLOOR', 'proposed price is below the server-calculated minimum', `lines.${line.requestLineId}.unitCents`))
    if (line.unitCents > snapshot.listing.referenceUnitCents) reasons.push(safeReason('PRICE_ABOVE_REFERENCE', 'proposed price exceeds the listing reference price', `lines.${line.requestLineId}.unitCents`))
    const fit = assessLine(requestLine, snapshot)
    combinedFit = {
      hardRequirementsPassed: combinedFit.hardRequirementsPassed && fit.hardRequirementsPassed,
      coverage: combinedFit.coverage === null || fit.coverage === null
        ? null
        : Math.round((combinedFit.coverage + fit.coverage) / 2),
      requirements: [...combinedFit.requirements, ...fit.requirements],
      reasons: [...combinedFit.reasons, ...fit.reasons],
    }
    offerLines.push(line)
    itemsCents = checkedAdd(itemsCents, checkedMultiply(line.quantity, line.unitCents))
  }
  for (const requestLine of context.brief.lines) {
    if (!seen.has(requestLine.lineId)) reasons.push(safeReason('MISSING_LINE', 'proposal does not satisfy every request line', `lines.${requestLine.lineId}`))
  }
  reasons.push(...combinedFit.reasons)
  if (!combinedFit.hardRequirementsPassed) reasons.push(safeReason('REQUIREMENT_NOT_MET', 'one or more hard requirements failed', 'fit'))
  if (reasons.length) return { ok: false, reasons: deduplicateReasons(reasons) }
  return {
    ok: true,
    offer: {
      schemaVersion: 1,
      jobId: context.jobId,
      candidateId: proposal.candidateId,
      merchantId: context.merchantId,
      parentOffer: proposal.parentOffer,
      policy: { ...context.policy.policy },
      serviceOptionId: null,
      lines: offerLines.map((line) => ({ ...line, listing: { ...line.listing } })),
      itemsCents,
      shippingCents: context.policy.shippingCents,
      totalCents: checkedAdd(itemsCents, context.policy.shippingCents),
      arrivalCalendarDays: context.policy.arrivalCalendarDays,
      warrantyMonths: context.policy.warrantyMonths,
      returnDays: context.policy.returnDays,
      fit: combinedFit,
      claims: proposal.claims.map((claim) => ({ ...claim, sourceIds: [...claim.sourceIds] })),
      status: 'accepted',
      mode: context.mode ?? 'fixture',
      createdAt: context.now,
    },
  }
}

function canonicalComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalComparable)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalComparable(child)]),
  )
}

function sameFrozenSnapshot(opening: CatalogSnapshot, current: CatalogSnapshot): boolean {
  return opening.variant.id === current.variant.id
    && opening.variant.productId === current.variant.productId
    && opening.variant.title === current.variant.title
    && opening.variant.category === current.variant.category
    && opening.variant.profile.id === current.variant.profile.id
    && opening.variant.profile.version === current.variant.profile.version
    && opening.variant.manufacturerPartNumber === current.variant.manufacturerPartNumber
    && opening.variant.syntheticProduct === current.variant.syntheticProduct
    && opening.listing.merchantId === current.listing.merchantId
    && opening.listing.listing.id === current.listing.listing.id
    && opening.listing.listing.version === current.listing.listing.version
    && opening.listing.variantId === current.listing.variantId
    && opening.listing.condition === current.listing.condition
    && opening.listing.unitId === current.listing.unitId
    && opening.listing.referenceUnitCents === current.listing.referenceUnitCents
    && opening.listing.operatorFloorCents === current.listing.operatorFloorCents
    && JSON.stringify(canonicalComparable(opening.variant.attributes))
      === JSON.stringify(canonicalComparable(current.variant.attributes))
    && JSON.stringify(canonicalComparable(opening.listing.diagnosticAttributes))
      === JSON.stringify(canonicalComparable(current.listing.diagnosticAttributes))
}

function mergeFit(left: FitAssessment, right: FitAssessment): FitAssessment {
  return {
    hardRequirementsPassed: left.hardRequirementsPassed && right.hardRequirementsPassed,
    coverage: left.coverage === null || right.coverage === null
      ? null
      : Math.round((left.coverage + right.coverage) / 2),
    requirements: [...left.requirements, ...right.requirements],
    reasons: [...left.reasons, ...right.reasons],
  }
}

export function validateFinalOfferRevision(
  context: FinalOfferValidationContext,
  candidate: FinalOfferCandidate,
): SellerValidationResult {
  const reasons: SafeReason[] = []
  const opening = context.openingOffer
  if (opening.jobId !== context.jobId || opening.merchantId !== context.merchantId) {
    reasons.push(safeReason('WRONG_JOB_SCOPE', 'opening offer is outside the seller job scope', 'openingOffer'))
  }
  if (opening.status !== 'accepted') {
    reasons.push(safeReason('INVALID_INPUT', 'final revision requires an accepted opening offer', 'openingOffer.status'))
  }
  if (opening.candidateId !== context.candidateId || candidate.candidateId !== context.candidateId) {
    reasons.push(safeReason('WRONG_JOB_SCOPE', 'final candidate is outside the seller job scope', 'candidateId'))
  }
  if (candidate.parentOffer.id !== opening.offer.id || candidate.parentOffer.version !== opening.offer.version) {
    reasons.push(safeReason('PARENT_OFFER_MISMATCH', 'final revision must reference the frozen opening offer', 'parentOffer'))
  }
  if (
    candidate.policy.id !== context.policy.policy.id ||
    candidate.policy.version !== context.policy.policy.version ||
    opening.policy.id !== context.policy.policy.id ||
    opening.policy.version !== context.policy.policy.version
  ) {
    reasons.push(safeReason('POLICY_VERSION_STALE', 'final revision policy is not the current opening policy', 'policy'))
  }
  if (!context.policy.enabled) reasons.push(safeReason('POLICY_DISABLED', 'merchant policy is disabled', 'policy'))

  let serviceTerms: FinalServiceTerms | null = null
  try {
    serviceTerms = resolveFinalServiceTerms(context.policy, candidate.serviceOptionId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'service option is invalid'
    reasons.push(safeReason('INVALID_INPUT', message, 'serviceOptionId'))
  }

  const candidateLines = new Map<string, OfferLine>()
  for (const line of candidate.lines) {
    if (candidateLines.has(line.requestLineId)) {
      reasons.push(safeReason('DUPLICATE_LINE', 'final revision repeats a request line', `lines.${line.requestLineId}`))
    } else {
      candidateLines.set(line.requestLineId, line)
    }
  }
  if (candidate.lines.length !== opening.lines.length) {
    reasons.push(safeReason('FROZEN_BASKET_CHANGED', 'final revision must keep the opening line set', 'lines'))
  }

  let itemsCents = 0
  let baseCostCents = 0
  let minimumContributionCents = 0
  let finalFit: FitAssessment = {
    hardRequirementsPassed: true,
    coverage: null,
    requirements: [],
    reasons: [],
  }
  for (const openingLine of opening.lines) {
    const line = candidateLines.get(openingLine.requestLineId)
    if (!line) {
      reasons.push(safeReason('FROZEN_BASKET_CHANGED', 'final revision is missing an opening line', `lines.${openingLine.requestLineId}`))
      continue
    }
    if (
      line.listing.id !== openingLine.listing.id ||
      line.listing.version !== openingLine.listing.version ||
      line.quantity !== openingLine.quantity
    ) {
      reasons.push(safeReason('FROZEN_BASKET_CHANGED', 'listing identity and quantity cannot change in a final revision', `lines.${line.requestLineId}`))
    }
    if (!isSafeCents(line.unitCents)) {
      reasons.push(safeReason('INVALID_INPUT', 'final unit price must be non-negative integer cents', `lines.${line.requestLineId}.unitCents`))
      continue
    }
    if (line.unitCents > openingLine.unitCents) {
      reasons.push(safeReason('FINAL_LINE_PRICE_INCREASED', 'final unit price cannot increase', `lines.${line.requestLineId}.unitCents`))
    }
    const openingSnapshot = findSnapshotInCatalog(context.openingCatalog, openingLine)
    const currentSnapshot = findSnapshotInCatalog(context.currentCatalog, line)
    if (!openingSnapshot || !currentSnapshot || !sameFrozenSnapshot(openingSnapshot, currentSnapshot)) {
      reasons.push(safeReason('FROZEN_BASKET_CHANGED', 'listing configuration or condition changed after the opening offer', `lines.${line.requestLineId}.listing`))
      continue
    }
    const requestLine = context.brief.lines.find((candidateLine) => candidateLine.lineId === line.requestLineId)
    if (!requestLine) {
      reasons.push(safeReason('MISSING_LINE', 'final revision references a request line outside the seller brief', `lines.${line.requestLineId}`))
      continue
    }
    finalFit = mergeFit(finalFit, assessLine(requestLine, currentSnapshot))
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      reasons.push(safeReason('QUANTITY_INVALID', 'final quantity must be a safe integer from one to ten', `lines.${line.requestLineId}.quantity`))
      continue
    }
    if (line.quantity > currentSnapshot.availableQuantity) {
      reasons.push(safeReason('QUANTITY_UNAVAILABLE', 'final quantity is not available in the frozen listing', `lines.${line.requestLineId}.quantity`))
    }
    const economics = policyForListing(context.policy, line.listing.id)
    if (!economics) {
      reasons.push(safeReason('INVALID_INPUT', 'policy does not contain cost and contribution for the frozen listing', `policy.${line.listing.id}`))
      continue
    }
    const minimum = minimumUnitCents({
      referenceUnitCents: currentSnapshot.listing.referenceUnitCents,
      operatorFloorCents: currentSnapshot.listing.operatorFloorCents,
      maxDiscountBps: context.policy.maxDiscountBps,
      unitCostCents: economics.cost,
      minimumContributionCents: economics.contribution,
    })
    if (line.unitCents < minimum) reasons.push(safeReason('PRICE_BELOW_FLOOR', 'final unit price is below the server-calculated minimum', `lines.${line.requestLineId}.unitCents`))
    if (line.unitCents > currentSnapshot.listing.referenceUnitCents) reasons.push(safeReason('PRICE_ABOVE_REFERENCE', 'final unit price exceeds the listing reference price', `lines.${line.requestLineId}.unitCents`))
    itemsCents = checkedAdd(itemsCents, checkedMultiply(line.quantity, line.unitCents))
    baseCostCents = checkedAdd(baseCostCents, checkedMultiply(line.quantity, economics.cost))
    minimumContributionCents = checkedAdd(minimumContributionCents, checkedMultiply(line.quantity, economics.contribution))
  }

  if (!serviceTerms) return { ok: false, reasons: deduplicateReasons(reasons) }
  const deliveredTotal = checkedAdd(itemsCents, serviceTerms.shippingCents)
  const contributionCost = checkedAdd(baseCostCents, serviceTerms.incrementalCostCents, minimumContributionCents)
  if (itemsCents < contributionCost) reasons.push(safeReason('CONTRIBUTION_TOO_LOW', 'final bundle contribution is below the policy minimum after service cost', 'serviceOptionId'))
  if (deliveredTotal > opening.totalCents) reasons.push(safeReason('FINAL_TOTAL_INCREASED', 'final delivered total cannot exceed the opening offer', 'totalCents'))
  if (serviceTerms.arrivalCalendarDays > opening.arrivalCalendarDays
    || serviceTerms.warrantyMonths < opening.warrantyMonths
    || serviceTerms.returnDays < opening.returnDays) {
    reasons.push(safeReason('FINAL_TERM_WEAKENED', 'final service terms cannot weaken the opening offer', 'serviceOptionId'))
  }
  reasons.push(...finalFit.reasons)
  if (!finalFit.hardRequirementsPassed) reasons.push(safeReason('REQUIREMENT_NOT_MET', 'one or more hard requirements failed', 'fit'))
  if (reasons.length) return { ok: false, reasons: deduplicateReasons(reasons) }
  return {
    ok: true,
    offer: {
      schemaVersion: 1,
      jobId: context.jobId,
      candidateId: context.candidateId,
      merchantId: context.merchantId,
      parentOffer: { ...opening.offer },
      policy: { ...context.policy.policy },
      serviceOptionId: serviceTerms.serviceOptionId,
      lines: candidate.lines.map((line) => ({ ...line, listing: { ...line.listing } })),
      itemsCents,
      shippingCents: serviceTerms.shippingCents,
      totalCents: deliveredTotal,
      arrivalCalendarDays: serviceTerms.arrivalCalendarDays,
      warrantyMonths: serviceTerms.warrantyMonths,
      returnDays: serviceTerms.returnDays,
      fit: finalFit,
      claims: opening.claims.map((claim) => ({ ...claim, sourceIds: [...claim.sourceIds] })),
      status: 'accepted',
      mode: context.mode ?? opening.mode,
      createdAt: context.now,
    },
  }
}

export interface FinalPricingAuthorityLine {
  requestLineId: string
  listing: { id: string; version: number }
  quantity: number
  unitCents: Cents
  lowestAuthorizedUnitCents: Cents
}

export interface FinalPricingAuthority {
  schemaVersion: 2
  jobId: string
  candidateId: string
  offer: { id: string; version: number }
  lines: FinalPricingAuthorityLine[]
  shippingCents: Cents
  totalCents: Cents
}

/**
 * The merchant's own price authority for one sealed final invitation.
 *
 * Derived from the frozen opening offer, the opening catalog snapshot and the pinned
 * policy with the same `minimumUnitCents` rule that `validateFinalOfferRevision`
 * enforces, so a proposal inside this authority is not rejected for price. Only the
 * resulting lowest unit price leaves Convex (it equals the operator floor when that
 * floor binds); costs, discount caps and contribution inputs do not. Returns null when any frozen line cannot be priced,
 * in which case the provider receives no authority and can only hold or abstain.
 */
export function finalPricingAuthority(input: {
  jobId: string
  candidateId: string
  openingOffer: Pick<OfferVersion, 'offer' | 'lines' | 'shippingCents' | 'totalCents'>
  catalog: CatalogSnapshot[]
  policy: PricingPolicy
}): FinalPricingAuthority | null {
  if (!input.policy.enabled) return null
  const lines: FinalPricingAuthorityLine[] = []
  let itemsCents = 0
  for (const line of input.openingOffer.lines) {
    const snapshot = findSnapshotInCatalog(input.catalog, line)
    const economics = policyForListing(input.policy, line.listing.id)
    if (!snapshot || !economics || !isSafeCents(line.unitCents)) return null
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) return null
    const minimum = minimumUnitCents({
      referenceUnitCents: snapshot.listing.referenceUnitCents,
      operatorFloorCents: snapshot.listing.operatorFloorCents,
      maxDiscountBps: input.policy.maxDiscountBps,
      unitCostCents: economics.cost,
      minimumContributionCents: economics.contribution,
    })
    lines.push({
      requestLineId: line.requestLineId,
      listing: { id: line.listing.id, version: line.listing.version },
      quantity: line.quantity,
      unitCents: line.unitCents,
      // Never above the current price: a line already at or below its minimum has no room.
      lowestAuthorizedUnitCents: Math.min(line.unitCents, minimum),
    })
    itemsCents = checkedAdd(itemsCents, checkedMultiply(line.quantity, line.unitCents))
  }
  if (checkedAdd(itemsCents, input.openingOffer.shippingCents) !== input.openingOffer.totalCents) return null
  return {
    schemaVersion: 2,
    jobId: input.jobId,
    candidateId: input.candidateId,
    offer: { id: input.openingOffer.offer.id, version: input.openingOffer.offer.version },
    lines,
    shippingCents: input.openingOffer.shippingCents,
    totalCents: input.openingOffer.totalCents,
  }
}

function deduplicateReasons(reasons: SafeReason[]): SafeReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    const key = `${reason.code}:${reason.field ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
