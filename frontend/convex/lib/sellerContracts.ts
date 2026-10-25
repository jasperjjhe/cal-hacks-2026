import type { Contract } from "../../src/contracts/index.ts"
import { contracts } from "../../src/contracts/index.ts"
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

export type Ref = Contract<'Ref'>

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

export type Requirement = Contract<'Requirement'>

export type RequestLine = Contract<'RequestLine'>

export type SharedTarget = NonNullable<ConfirmedBrief['sharedTarget']>

export type ConfirmedBrief = Contract<'ConfirmedBrief'>

export type SellerBrief = Contract<'SellerBrief'>

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

export type OfferLine = SellerProposal['lines'][number]

export type Claim = SellerProposal['claims'][number]

export type SellerProposal = Contract<'SellerProposal'>

export type SellerDecision = Contract<'SellerDecision'>

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

function assertId(value: unknown, label: string): asserts value is Id {
  if (!contracts.Ref.shape.id.safeParse(value).success) throw new SellerContractError('INVALID_INPUT', `${label} is invalid`, label)
}
function parseContract(name: 'ConfirmedBrief' | 'SellerBrief' | 'SellerDecision', value: unknown) {
  const result = contracts[name].safeParse(value)
  if (!result.success) throw new SellerContractError(name === 'SellerDecision' ? 'MALFORMED_PROVIDER_OUTPUT' : 'INVALID_INPUT', `Invalid ${name}`)
  return result.data
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
  parseContract('ConfirmedBrief', value)
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
  parseContract('SellerBrief', value)
}

export function parseSellerDecision(value: unknown): SellerDecision {
  const result = contracts.SellerDecision.safeParse(value)
  if (!result.success) throw new SellerContractError('MALFORMED_PROVIDER_OUTPUT', 'Invalid SellerDecision')
  return result.data
}

export function safeReason(
  code: SellerSafeReasonCode,
  message: string,
  field: string | null = null,
): SafeReason {
  return { code, field, message }
}
