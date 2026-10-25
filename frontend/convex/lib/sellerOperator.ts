import type {
  Attribute,
  Cents,
  CatalogVariant,
  Listing,
  PricingPolicy,
  Ref,
  SafeReason,
} from './sellerContracts.ts'

export interface OperatorListing {
  listing: Ref
  merchantId: string
  variantId: string
  title: string
  category: CatalogVariant['category']
  profile: Ref
  manufacturerPartNumber: string | null
  attributes: Record<string, Attribute>
  syntheticProduct: boolean
  condition: Listing['condition']
  unitId: string | null
  initialQuantity: number
  availableQuantity: number
  referenceUnitCents: Cents
  operatorFloorCents: Cents
  diagnosticAttributes: Record<string, Attribute>
  enabled: boolean
}

export interface OperatorListingDraft {
  initialQuantity: number
  referenceUnitCents: number
  operatorFloorCents: number
}

export interface OperatorDraftError {
  field: keyof OperatorListingDraft
  message: string
}

export interface OperatorMerchantView {
  merchantId: string
  displayName: string
  enabled: boolean
  paused: boolean
  currentPolicy: Ref | null
}

export interface OperatorOfferView {
  offer: Ref
  jobId: string
  candidateId: string
  status: 'accepted' | 'rejected' | 'hold'
  totalCents: Cents
  mode: 'fixture' | 'live' | 'cached' | 'simulation' | 'visa_sandbox'
  createdAt: number
}

export interface OperatorEventView {
  eventType: string
  jobId: string | null
  candidateId: string | null
  offerId: string | null
  safeReasons: SafeReason[]
  createdAt: number
}

export interface OperatorAnalyticsView {
  reportingPeriod: { from: number; to: number } | null
  observedEventCount: number
  proposalEventCount: number
  rejectedProposalEventCount: number
  acceptedOfferEventCount: number
}

export interface OperatorDashboardView {
  merchant: OperatorMerchantView
  listings: OperatorListing[]
  policies: PricingPolicy[]
  recentOffers: OperatorOfferView[]
  analytics: OperatorAnalyticsView
  recentEvents: OperatorEventView[]
}

function cloneAttribute(attribute: Attribute): Attribute {
  return {
    ...attribute,
    value: Array.isArray(attribute.value) ? [...attribute.value] : attribute.value,
  }
}

function cloneAttributes(attributes: Record<string, Attribute>): Record<string, Attribute> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, attribute]) => [key, cloneAttribute(attribute)]),
  )
}

export function projectOperatorListing(
  listing: Listing,
  variant: CatalogVariant,
  availableQuantity: number,
  enabled = true,
): OperatorListing {
  return {
    listing: { ...listing.listing },
    merchantId: listing.merchantId,
    variantId: variant.id,
    title: variant.title,
    category: variant.category,
    profile: { ...variant.profile },
    manufacturerPartNumber: variant.manufacturerPartNumber,
    attributes: cloneAttributes(variant.attributes),
    syntheticProduct: variant.syntheticProduct,
    condition: listing.condition,
    unitId: listing.unitId,
    initialQuantity: listing.initialQuantity,
    availableQuantity: Math.max(0, Math.min(listing.initialQuantity, availableQuantity)),
    referenceUnitCents: listing.referenceUnitCents,
    operatorFloorCents: listing.operatorFloorCents,
    diagnosticAttributes: cloneAttributes(listing.diagnosticAttributes),
    enabled,
  }
}

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

export function validateOperatorListingDraft(draft: OperatorListingDraft): OperatorDraftError[] {
  const errors: OperatorDraftError[] = []
  if (!isSafeInteger(draft.initialQuantity) || draft.initialQuantity > 10_000) {
    errors.push({ field: 'initialQuantity', message: 'quantity must be a whole number from zero to 10000' })
  }
  if (!isSafeInteger(draft.referenceUnitCents, 1)) {
    errors.push({ field: 'referenceUnitCents', message: 'MSRP must be a positive whole number of cents' })
  }
  if (!isSafeInteger(draft.operatorFloorCents)) {
    errors.push({ field: 'operatorFloorCents', message: 'lowest accepted price must be a non-negative whole number of cents' })
  }
  if (
    isSafeInteger(draft.referenceUnitCents, 1)
    && isSafeInteger(draft.operatorFloorCents)
    && draft.operatorFloorCents > draft.referenceUnitCents
  ) {
    errors.push({ field: 'operatorFloorCents', message: 'lowest accepted price cannot exceed MSRP' })
  }
  return errors
}
