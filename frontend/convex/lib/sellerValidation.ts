import {
  type Attribute,
  type CatalogSnapshot,
  type Cents,
  type FitAssessment,
  type OfferLine,
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
  }
  const reasons = validatePolicyValues(next)
  if (reasons.length) {
    throw new SellerContractError('INVALID_INPUT', reasons[0].message, reasons[0].field)
  }
  return next
}

function numericValue(value: unknown, unit: string | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (unit === null) return value
  const definition = NUMERIC_UNITS[unit]
  if (!definition) return null
  const normalized = value * definition.multiplier
  return Number.isFinite(normalized) ? normalized : null
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
  const soft = requirements.filter((requirement) => requirement.strength === 'soft')
  const softWeight = soft.reduce((sum, requirement) => sum + requirement.weight, 0)
  const softMatches = soft.reduce(
    (sum, requirement) => sum + (requirement.status === 'satisfied' ? requirement.weight : 0),
    0,
  )
  const coverage = softWeight === 0 ? null : Math.round((100 * softMatches) / softWeight)
  return { hardRequirementsPassed, coverage, requirements, reasons }
}

function findSnapshot(context: SellerValidationContext, line: OfferLine): CatalogSnapshot | null {
  return context.catalog.find(
    (snapshot) =>
      snapshot.listing.listing.id === line.listing.id &&
      snapshot.listing.listing.version === line.listing.version,
  ) ?? null
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
  const allSoft = combinedFit.requirements.filter(r => r.strength === 'soft')
  const totalWeight = allSoft.reduce((s,r) => s+r.weight,0)
  combinedFit.coverage = totalWeight ? 100*allSoft.reduce((s,r) => s+(r.status==='satisfied'?r.weight:0),0)/totalWeight : null
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

function deduplicateReasons(reasons: SafeReason[]): SafeReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    const key = `${reason.code}:${reason.field ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
