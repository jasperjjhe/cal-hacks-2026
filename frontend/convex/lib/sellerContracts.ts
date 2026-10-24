export type Id = string
export type Cents = number
export type Ms = number
export type Version = number

export type Category =
  | 'laptop'
  | 'tech_accessory'
  | 'clothing'
  | 'household_accessory'
  | 'small_appliance'

export type Condition = 'new' | 'refurbished'
export type Value = string | number | boolean | string[]
export type Sort = 'best_fit' | 'cheapest' | 'soonest' | 'warranty'
export type RequirementOperator = 'equals' | 'in' | 'min' | 'max' | 'containsAll'
export type RequirementStrength = 'hard' | 'soft'

export interface Ref {
  id: Id
  version: Version
}

export interface ProfileField {
  id: string
  label: string
  kind: 'string' | 'number' | 'boolean' | 'string_array'
  unit: string | null
  allowedOperators: RequirementOperator[]
  allowedValues: string[] | null
  minimum: number | null
  maximum: number | null
}

export interface CategoryProfile {
  profile: Ref
  category: Category
  allowedConditions: Condition[]
  fields: ProfileField[]
  variantKeyFields: string[]
  compatibilityRuleId: string | null
  evidenceRuleId: string
}

export interface Requirement {
  id: Id
  fieldId: string
  operator: RequirementOperator
  value: Value
  unit: string | null
  strength: RequirementStrength
  weight: 1 | 2
}

export interface RequestLine {
  lineId: Id
  role: 'primary' | 'related'
  category: Category
  profile: Ref
  quantity: number
  allowedConditions: Condition[]
  requirements: Requirement[]
  useCaseSummary: string
}

export interface SharedTarget {
  amountCents: Cents
  consentId: Id
  consentedAt: Ms
}

export interface ConfirmedBrief {
  schemaVersion: 1
  request: Ref
  currency: 'USD'
  deliveryRegion: 'US-CA-SAN_FRANCISCO'
  deliveryDeadline: Ms
  lines: RequestLine[]
  sharedTarget: SharedTarget | null
}

export interface SellerBrief extends ConfirmedBrief {
  runId: Id
}

export interface Attribute {
  value: Value | null
  unit: string | null
  provenance: 'manufacturer' | 'real_report' | 'synthetic_demo'
  sourceId: Id | null
}

export interface CatalogVariant {
  id: Id
  productId: Id
  title: string
  category: Category
  profile: Ref
  manufacturerPartNumber: string | null
  attributes: Record<string, Attribute>
  syntheticProduct: boolean
}

export interface Listing {
  listing: Ref
  merchantId: Id
  variantId: Id
  condition: Condition
  unitId: Id | null
  initialQuantity: number
  referenceUnitCents: Cents
  operatorFloorCents: Cents
  diagnosticAttributes: Record<string, Attribute>
}

export interface PricingPolicy {
  policy: Ref
  merchantId: Id
  enabled: boolean
  maxDiscountBps: number
  unitCostByListing: Record<Id, Cents>
  minimumContributionByListing: Record<Id, Cents>
  costsAreSynthetic: boolean
  shippingCents: Cents
  arrivalCalendarDays: number
  warrantyMonths: number
  returnDays: number
}

export interface OfferLine {
  requestLineId: Id
  listing: Ref
  quantity: number
  unitCents: Cents
}

export interface Claim {
  id: Id
  requestLineId: Id
  text: string
  sourceIds: Id[]
}

export interface SellerProposal {
  schemaVersion: 1
  jobId: Id
  candidateId: Id
  parentOffer: Ref | null
  policy: Ref
  lines: OfferLine[]
  claims: Claim[]
  fitArgument: string
  privatePriceRationale: string
}

export type SellerDecision =
  | { kind: 'propose'; proposal: SellerProposal }
  | { kind: 'hold'; jobId: Id; offer: Ref }
  | { kind: 'abstain'; jobId: Id; reasonCode: string }

export type SellerSafeReasonCode =
  | 'UNAUTHENTICATED'
  | 'MERCHANT_NOT_FOUND'
  | 'MERCHANT_PAUSED'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_CATEGORY'
  | 'PROFILE_MISMATCH'
  | 'CONDITION_NOT_ALLOWED'
  | 'UNKNOWN_REQUIRED_FACT'
  | 'REQUIREMENT_NOT_MET'
  | 'INCOMPATIBLE_VARIANT'
  | 'WRONG_MERCHANT_SCOPE'
  | 'WRONG_JOB_SCOPE'
  | 'POLICY_DISABLED'
  | 'POLICY_VERSION_STALE'
  | 'LISTING_VERSION_STALE'
  | 'PRICE_BELOW_FLOOR'
  | 'PRICE_ABOVE_REFERENCE'
  | 'CONTRIBUTION_TOO_LOW'
  | 'QUANTITY_INVALID'
  | 'QUANTITY_UNAVAILABLE'
  | 'DUPLICATE_LINE'
  | 'MISSING_LINE'
  | 'TOO_MANY_LINES'
  | 'STALE_COMPLETION'
  | 'LATE_COMPLETION'
  | 'REPLAY_REJECTED'
  | 'MALFORMED_PROVIDER_OUTPUT'

export interface SafeReason {
  code: SellerSafeReasonCode
  field: string | null
  message: string
}

export interface RequirementResult {
  requirementId: Id
  status: 'satisfied' | 'unmet' | 'unknown'
  strength: RequirementStrength
  weight: 1 | 2
}

export interface FitAssessment {
  hardRequirementsPassed: boolean
  coverage: number | null
  requirements: RequirementResult[]
  reasons: SafeReason[]
}

export interface OfferVersion {
  schemaVersion: 1
  offer: Ref
  jobId: Id
  candidateId: Id
  merchantId: Id
  parentOffer: Ref | null
  policy: Ref
  lines: OfferLine[]
  itemsCents: Cents
  shippingCents: Cents
  totalCents: Cents
  arrivalCalendarDays: number
  warrantyMonths: number
  returnDays: number
  fit: FitAssessment
  claims: Claim[]
  status: 'accepted' | 'rejected' | 'hold'
  mode: 'fixture' | 'live' | 'cached' | 'simulation' | 'visa_sandbox'
  createdAt: Ms
}

export interface CatalogSnapshot {
  variant: CatalogVariant
  listing: Listing
  availableQuantity: number
}

export interface SellerValidationContext {
  jobId: Id
  merchantId: Id
  brief: SellerBrief
  policy: PricingPolicy
  candidates: Id[]
  catalog: CatalogSnapshot[]
  now: Ms
  mode?: OfferVersion['mode']
}

export interface SellerValidationSuccess {
  ok: true
  offer: Omit<OfferVersion, 'offer'>
}

export interface SellerValidationFailure {
  ok: false
  reasons: SafeReason[]
}

export type SellerValidationResult = SellerValidationSuccess | SellerValidationFailure

export class SellerContractError extends Error {
  readonly code: SellerSafeReasonCode
  readonly field: string | null

  constructor(code: SellerSafeReasonCode, message: string, field: string | null = null) {
    super(message)
    this.name = 'SellerContractError'
    this.code = code
    this.field = field
  }
}

const MAX_ID_LENGTH = 128
const MAX_TEXT_LENGTH = 2_000
const MAX_LINES = 3
const MAX_REQUIREMENTS_PER_LINE = 40
const MAX_CLAIMS = 20
const FORBIDDEN_SELLER_BRIEF_KEYS = new Set([
  'privateMaximumCents',
  'rawMessages',
  'origins',
  'ownerId',
  'operatorFloorCents',
  'unitCostByListing',
  'minimumContributionByListing',
  'privatePriceRationale',
  'buyerCeilingCents',
  'competitorCosts',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new SellerContractError('INVALID_INPUT', `${label} contains an unknown field`, `${label}.${key}`)
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new SellerContractError('INVALID_INPUT', `${label} is missing a required field`, `${label}.${key}`)
    }
  }
}

function assertText(value: unknown, label: string, max = MAX_TEXT_LENGTH): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new SellerContractError('INVALID_INPUT', `${label} must be a non-empty bounded string`, label)
  }
}

function assertId(value: unknown, label: string): asserts value is Id {
  assertText(value, label, MAX_ID_LENGTH)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new SellerContractError('INVALID_INPUT', `${label} contains unsupported characters`, label)
  }
}

function assertSafeInteger(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new SellerContractError('INVALID_INPUT', `${label} must be a safe integer >= ${minimum}`, label)
  }
}

function assertRef(value: unknown, label: string): asserts value is Ref {
  if (!isRecord(value)) {
    throw new SellerContractError('INVALID_INPUT', `${label} must be a reference`, label)
  }
  assertKeys(value, ['id', 'version'], label)
  assertId(value.id, `${label}.id`)
  assertSafeInteger(value.version, `${label}.version`, 1)
}

function assertValue(value: unknown, label: string): asserts value is Value {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string') &&
    value.length <= 40
  ) {
    return
  }
  throw new SellerContractError('INVALID_INPUT', `${label} has an unsupported value`, label)
}

function assertRequirement(value: unknown, label: string): asserts value is Requirement {
  if (!isRecord(value)) {
    throw new SellerContractError('INVALID_INPUT', `${label} must be an object`, label)
  }
  assertKeys(value, ['id', 'fieldId', 'operator', 'value', 'unit', 'strength', 'weight'], label)
  assertId(value.id, `${label}.id`)
  assertText(value.fieldId, `${label}.fieldId`, 100)
  if (!['equals', 'in', 'min', 'max', 'containsAll'].includes(String(value.operator))) {
    throw new SellerContractError('INVALID_INPUT', `${label}.operator is not supported`, `${label}.operator`)
  }
  assertValue(value.value, `${label}.value`)
  if (value.unit !== null && value.unit !== undefined) assertText(value.unit, `${label}.unit`, 40)
  if (value.strength !== 'hard' && value.strength !== 'soft') {
    throw new SellerContractError('INVALID_INPUT', `${label}.strength is not supported`, `${label}.strength`)
  }
  if (value.weight !== 1 && value.weight !== 2) {
    throw new SellerContractError('INVALID_INPUT', `${label}.weight must be 1 or 2`, `${label}.weight`)
  }
}

function assertRequestLine(value: unknown, label: string): asserts value is RequestLine {
  if (!isRecord(value)) {
    throw new SellerContractError('INVALID_INPUT', `${label} must be an object`, label)
  }
  assertKeys(
    value,
    ['lineId', 'role', 'category', 'profile', 'quantity', 'allowedConditions', 'requirements', 'useCaseSummary'],
    label,
  )
  assertId(value.lineId, `${label}.lineId`)
  if (value.role !== 'primary' && value.role !== 'related') {
    throw new SellerContractError('INVALID_INPUT', `${label}.role is not supported`, `${label}.role`)
  }
  if (!['laptop', 'tech_accessory', 'clothing', 'household_accessory', 'small_appliance'].includes(String(value.category))) {
    throw new SellerContractError('UNSUPPORTED_CATEGORY', `${label}.category is not supported`, `${label}.category`)
  }
  assertRef(value.profile, `${label}.profile`)
  assertSafeInteger(value.quantity, `${label}.quantity`, 1)
  if (value.quantity > 10) {
    throw new SellerContractError('QUANTITY_INVALID', `${label}.quantity exceeds the per-line limit`, `${label}.quantity`)
  }
  if (
    !Array.isArray(value.allowedConditions) ||
    value.allowedConditions.length === 0 ||
    value.allowedConditions.some((condition) => condition !== 'new' && condition !== 'refurbished')
  ) {
    throw new SellerContractError('INVALID_INPUT', `${label}.allowedConditions is invalid`, `${label}.allowedConditions`)
  }
  if (
    !Array.isArray(value.requirements) ||
    value.requirements.length > MAX_REQUIREMENTS_PER_LINE
  ) {
    throw new SellerContractError('INVALID_INPUT', `${label}.requirements is invalid`, `${label}.requirements`)
  }
  value.requirements.forEach((requirement, index) => assertRequirement(requirement, `${label}.requirements[${index}]`))
  assertText(value.useCaseSummary, `${label}.useCaseSummary`, 500)
}

export function assertNoPrivateSellerFields(value: unknown): void {
  const visit = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`))
      return
    }
    if (!isRecord(node)) return
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_SELLER_BRIEF_KEYS.has(key)) {
        throw new SellerContractError('INVALID_INPUT', `private seller input field is forbidden: ${key}`, `${path}.${key}`)
      }
      visit(child, `${path}.${key}`)
    }
  }
  visit(value, '$')
}

export function assertConfirmedBrief(value: unknown): asserts value is ConfirmedBrief {
  if (!isRecord(value)) {
    throw new SellerContractError('INVALID_INPUT', 'confirmed brief must be an object')
  }
  assertKeys(value, ['schemaVersion', 'request', 'currency', 'deliveryRegion', 'deliveryDeadline', 'lines', 'sharedTarget'], 'brief')
  if (value.schemaVersion !== 1) {
    throw new SellerContractError('INVALID_INPUT', 'unsupported brief schema version', 'brief.schemaVersion')
  }
  assertRef(value.request, 'brief.request')
  if (value.currency !== 'USD' || value.deliveryRegion !== 'US-CA-SAN_FRANCISCO') {
    throw new SellerContractError('INVALID_INPUT', 'brief currency or delivery region is unsupported', 'brief')
  }
  assertSafeInteger(value.deliveryDeadline, 'brief.deliveryDeadline', 1)
  if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LINES) {
    throw new SellerContractError('INVALID_INPUT', 'brief.lines must contain one to three lines', 'brief.lines')
  }
  value.lines.forEach((line, index) => assertRequestLine(line, `brief.lines[${index}]`))
  if (value.sharedTarget !== null) {
    if (!isRecord(value.sharedTarget)) {
      throw new SellerContractError('INVALID_INPUT', 'brief.sharedTarget must be null or an object', 'brief.sharedTarget')
    }
    assertKeys(value.sharedTarget, ['amountCents', 'consentId', 'consentedAt'], 'brief.sharedTarget')
    assertSafeInteger(value.sharedTarget.amountCents, 'brief.sharedTarget.amountCents', 1)
    assertId(value.sharedTarget.consentId, 'brief.sharedTarget.consentId')
    assertSafeInteger(value.sharedTarget.consentedAt, 'brief.sharedTarget.consentedAt', 1)
  }
}

export function buildSellerBrief(confirmed: ConfirmedBrief, runId: Id): SellerBrief {
  assertConfirmedBrief(confirmed)
  assertId(runId, 'runId')
  const brief: SellerBrief = {
    schemaVersion: 1,
    request: { ...confirmed.request },
    runId,
    currency: confirmed.currency,
    deliveryRegion: confirmed.deliveryRegion,
    deliveryDeadline: confirmed.deliveryDeadline,
    lines: confirmed.lines.map((line) => ({
      ...line,
      profile: { ...line.profile },
      allowedConditions: [...line.allowedConditions],
      requirements: line.requirements.map((requirement) => ({ ...requirement })),
    })),
    sharedTarget: confirmed.sharedTarget ? { ...confirmed.sharedTarget } : null,
  }
  assertNoPrivateSellerFields(brief)
  return brief
}

export function assertSellerBriefSafe(value: unknown): asserts value is SellerBrief {
  assertNoPrivateSellerFields(value)
  if (!isRecord(value)) {
    throw new SellerContractError('INVALID_INPUT', 'seller brief must be an object')
  }
  assertKeys(value, ['schemaVersion', 'request', 'runId', 'currency', 'deliveryRegion', 'deliveryDeadline', 'lines', 'sharedTarget'], 'sellerBrief')
  assertId(value.runId, 'sellerBrief.runId')
  const confirmed = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'runId'))
  assertConfirmedBrief(confirmed)
}

function assertClaim(value: unknown, label: string): asserts value is Claim {
  if (!isRecord(value)) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label} must be an object`, label)
  }
  assertKeys(value, ['id', 'requestLineId', 'text', 'sourceIds'], label)
  assertId(value.id, `${label}.id`)
  assertId(value.requestLineId, `${label}.requestLineId`)
  assertText(value.text, `${label}.text`, 500)
  if (!Array.isArray(value.sourceIds) || value.sourceIds.length > 20) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label}.sourceIds is invalid`, `${label}.sourceIds`)
  }
  value.sourceIds.forEach((sourceId, index) => assertId(sourceId, `${label}.sourceIds[${index}]`))
}

function assertOfferLine(value: unknown, label: string): asserts value is OfferLine {
  if (!isRecord(value)) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label} must be an object`, label)
  }
  assertKeys(value, ['requestLineId', 'listing', 'quantity', 'unitCents'], label)
  assertId(value.requestLineId, `${label}.requestLineId`)
  assertRef(value.listing, `${label}.listing`)
  assertSafeInteger(value.quantity, `${label}.quantity`, 1)
  assertSafeInteger(value.unitCents, `${label}.unitCents`, 0)
}

function assertProposal(value: unknown, label: string): asserts value is SellerProposal {
  if (!isRecord(value)) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label} must be an object`, label)
  }
  assertKeys(value, ['schemaVersion', 'jobId', 'candidateId', 'parentOffer', 'policy', 'lines', 'claims', 'fitArgument', 'privatePriceRationale'], label)
  if (value.schemaVersion !== 1) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label}.schemaVersion is unsupported`, `${label}.schemaVersion`)
  }
  assertId(value.jobId, `${label}.jobId`)
  assertId(value.candidateId, `${label}.candidateId`)
  if (value.parentOffer !== null) assertRef(value.parentOffer, `${label}.parentOffer`)
  assertRef(value.policy, `${label}.policy`)
  if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LINES) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label}.lines is invalid`, `${label}.lines`)
  }
  value.lines.forEach((line, index) => assertOfferLine(line, `${label}.lines[${index}]`))
  if (!Array.isArray(value.claims) || value.claims.length > MAX_CLAIMS) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', `${label}.claims is invalid`, `${label}.claims`)
  }
  value.claims.forEach((claim, index) => assertClaim(claim, `${label}.claims[${index}]`))
  assertText(value.fitArgument, `${label}.fitArgument`, 1_000)
  assertText(value.privatePriceRationale, `${label}.privatePriceRationale`, 1_000)
}

export function parseSellerDecision(value: unknown): SellerDecision {
  if (!isRecord(value)) {
    throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', 'seller decision must be an object')
  }
  if (value.kind === 'propose') {
    assertKeys(value, ['kind', 'proposal'], 'decision')
    assertProposal(value.proposal, 'decision.proposal')
    return { kind: 'propose', proposal: value.proposal }
  }
  if (value.kind === 'hold') {
    assertKeys(value, ['kind', 'jobId', 'offer'], 'decision')
    assertId(value.jobId, 'decision.jobId')
    assertRef(value.offer, 'decision.offer')
    return { kind: 'hold', jobId: value.jobId, offer: value.offer }
  }
  if (value.kind === 'abstain') {
    assertKeys(value, ['kind', 'jobId', 'reasonCode'], 'decision')
    assertId(value.jobId, 'decision.jobId')
    assertText(value.reasonCode, 'decision.reasonCode', 100)
    return { kind: 'abstain', jobId: value.jobId, reasonCode: value.reasonCode }
  }
  throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', 'seller decision kind is unsupported', 'decision.kind')
}

export function safeReason(
  code: SellerSafeReasonCode,
  message: string,
  field: string | null = null,
): SafeReason {
  return { code, field, message }
}
