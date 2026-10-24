import type {
  Attribute,
  CatalogSnapshot,
  CatalogVariant,
  ConfirmedBrief,
  Id,
  Listing,
  PricingPolicy,
  Ref,
  Requirement,
  SellerBrief,
  SellerProposal,
} from './sellerContracts.ts'
import { buildSellerBrief } from './sellerContracts.ts'

const synthetic = (value: Attribute['value'], unit: string | null = null): Attribute => ({
  value,
  unit,
  provenance: 'synthetic_demo',
  sourceId: null,
})

const ref = (id: Id, version = 1): Ref => ({ id, version })

const requirement = (
  id: Id,
  fieldId: string,
  operator: Requirement['operator'],
  value: Requirement['value'],
  unit: string | null,
  strength: Requirement['strength'] = 'hard',
  weight: 1 | 2 = 1,
): Requirement => ({ id, fieldId, operator, value, unit, strength, weight })

const profiles = {
  laptop: ref('profile_laptop'),
  accessory: ref('profile_tech_accessory'),
  clothing: ref('profile_clothing'),
  household: ref('profile_household_accessory'),
  appliance: ref('profile_small_appliance'),
}

export const demoSellerBrief: SellerBrief = buildSellerBrief(
  {
    schemaVersion: 1,
    request: ref('req_demo_1'),
    currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO',
    deliveryDeadline: Date.parse('2026-11-20T23:59:59.000Z'),
    lines: [
      {
        lineId: 'line_main',
        role: 'primary',
        category: 'laptop',
        profile: profiles.laptop,
        quantity: 1,
        allowedConditions: ['new'],
        requirements: [
          requirement('r_os', 'osFamily', 'equals', 'macOS', null),
          requirement('r_ram', 'ramGb', 'min', 16, 'GB'),
          requirement('r_storage', 'storageGb', 'min', 512, 'GB'),
          requirement('r_weight', 'weightG', 'max', 1_500, 'g', 'soft', 2),
        ],
        useCaseSummary: 'A new laptop for coursework.',
      },
    ],
    sharedTarget: null,
  },
  'run_demo_1',
)

export const clothingBrief: SellerBrief = buildSellerBrief(
  {
    schemaVersion: 1,
    request: ref('req_demo_clothing'),
    currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO',
    deliveryDeadline: Date.parse('2026-11-20T23:59:59.000Z'),
    lines: [
      {
        lineId: 'line_clothing',
        role: 'primary',
        category: 'clothing',
        profile: profiles.clothing,
        quantity: 1,
        allowedConditions: ['new'],
        requirements: [
          requirement('c_size', 'sizeLabel', 'equals', 'M', null),
          requirement('c_material', 'material', 'containsAll', ['cotton'], null),
        ],
        useCaseSummary: 'A new navy cotton shirt.',
      },
    ],
    sharedTarget: null,
  },
  'run_demo_clothing',
)

export const householdBrief: SellerBrief = buildSellerBrief(
  {
    schemaVersion: 1,
    request: ref('req_demo_household'),
    currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO',
    deliveryDeadline: Date.parse('2026-11-20T23:59:59.000Z'),
    lines: [
      {
        lineId: 'line_household',
        role: 'primary',
        category: 'household_accessory',
        profile: profiles.household,
        quantity: 1,
        allowedConditions: ['new'],
        requirements: [
          requirement('h_width', 'widthMm', 'max', 600, 'mm'),
          requirement('h_mount', 'mounting', 'equals', 'freestanding', null),
        ],
        useCaseSummary: 'A compact shelf for a room.',
      },
    ],
    sharedTarget: null,
  },
  'run_demo_household',
)

export const applianceBrief: SellerBrief = buildSellerBrief(
  {
    schemaVersion: 1,
    request: ref('req_demo_appliance'),
    currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO',
    deliveryDeadline: Date.parse('2026-11-20T23:59:59.000Z'),
    lines: [
      {
        lineId: 'line_appliance',
        role: 'primary',
        category: 'small_appliance',
        profile: profiles.appliance,
        quantity: 1,
        allowedConditions: ['new'],
        requirements: [
          requirement('a_voltage', 'voltage', 'equals', 120, 'V'),
          requirement('a_frequency', 'frequency', 'equals', 60, 'Hz'),
          requirement('a_plug', 'plugRegion', 'equals', 'US', null),
        ],
        useCaseSummary: 'A US-compatible electric kettle.',
      },
    ],
    sharedTarget: null,
  },
  'run_demo_appliance',
)

const laptopVariant = (id: Id, title: string, attributes: Record<string, Attribute>): CatalogVariant => ({
  id,
  productId: `product_${id}`,
  title,
  category: 'laptop',
  profile: profiles.laptop,
  manufacturerPartNumber: null,
  attributes,
  syntheticProduct: true,
})

const baseLaptopAttributes = {
  osFamily: synthetic('macOS'),
  ramGb: synthetic(16, 'GB'),
  storageGb: synthetic(512, 'GB'),
  weightG: synthetic(1_240, 'g'),
  charging: synthetic('USB-C'),
}

export const variants: CatalogVariant[] = [
  laptopVariant('P1', 'DemoBook Air M2', { ...baseLaptopAttributes, healthPercent: synthetic(92, '%') }),
  laptopVariant('P2', 'DemoBook Air M3', { ...baseLaptopAttributes, healthPercent: synthetic(88, '%') }),
  laptopVariant('P3', 'DemoBook Air M4', { ...baseLaptopAttributes, healthPercent: synthetic(null, '%') }),
  laptopVariant('P4', 'DemoBook Pro M4', { ...baseLaptopAttributes, ramGb: synthetic(24, 'GB'), weightG: synthetic(1_450, 'g') }),
  laptopVariant('P5', 'DemoThink T14', {
    osFamily: synthetic('Windows'),
    ramGb: synthetic(16, 'GB'),
    storageGb: synthetic(512, 'GB'),
    weightG: synthetic(1_430, 'g'),
    charging: synthetic('USB-C'),
  }),
  laptopVariant('P6', 'DemoBook Air M2 Low Memory', {
    ...baseLaptopAttributes,
    ramGb: synthetic(8, 'GB'),
    storageGb: synthetic(256, 'GB'),
  }),
  {
    id: 'MOUSE',
    productId: 'product_MOUSE',
    title: 'Demo Wireless Mouse',
    category: 'tech_accessory',
    profile: profiles.accessory,
    manufacturerPartNumber: null,
    attributes: { compatibleVariantIds: synthetic(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) },
    syntheticProduct: true,
  },
  {
    id: 'HUB',
    productId: 'product_HUB',
    title: 'Demo USB-C Data Hub',
    category: 'tech_accessory',
    profile: profiles.accessory,
    manufacturerPartNumber: null,
    attributes: { compatibleVariantIds: synthetic(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) },
    syntheticProduct: true,
  },
  {
    id: 'C1',
    productId: 'product_C1',
    title: 'Demo Tee M',
    category: 'clothing',
    profile: profiles.clothing,
    manufacturerPartNumber: null,
    attributes: {
      brand: synthetic('DemoWear'),
      sizeSystem: synthetic('Demo US unisex'),
      sizeLabel: synthetic('M'),
      color: synthetic('navy'),
      material: synthetic(['cotton']),
      chestMm: synthetic(1_000, 'mm'),
      lengthMm: synthetic(700, 'mm'),
    },
    syntheticProduct: true,
  },
  {
    id: 'C2',
    productId: 'product_C2',
    title: 'Demo Tee L Blend',
    category: 'clothing',
    profile: profiles.clothing,
    manufacturerPartNumber: null,
    attributes: {
      brand: synthetic('DemoWear'),
      sizeSystem: synthetic('Demo US unisex'),
      sizeLabel: synthetic('L'),
      color: synthetic('navy'),
      material: synthetic(['cotton', 'polyester']),
      chestMm: synthetic(1_080, 'mm'),
      lengthMm: synthetic(730, 'mm'),
    },
    syntheticProduct: true,
  },
  {
    id: 'H1',
    productId: 'product_H1',
    title: 'Demo Shelf Compact',
    category: 'household_accessory',
    profile: profiles.household,
    manufacturerPartNumber: null,
    attributes: {
      type: synthetic('shelf'),
      material: synthetic('wood'),
      color: synthetic('white'),
      mounting: synthetic('freestanding'),
      widthMm: synthetic(500, 'mm'),
      depthMm: synthetic(300, 'mm'),
      heightMm: synthetic(600, 'mm'),
    },
    syntheticProduct: true,
  },
  {
    id: 'H2',
    productId: 'product_H2',
    title: 'Demo Shelf Wide',
    category: 'household_accessory',
    profile: profiles.household,
    manufacturerPartNumber: null,
    attributes: {
      type: synthetic('shelf'),
      material: synthetic('wood'),
      color: synthetic('white'),
      mounting: synthetic('freestanding'),
      widthMm: synthetic(800, 'mm'),
      depthMm: synthetic(400, 'mm'),
      heightMm: synthetic(800, 'mm'),
    },
    syntheticProduct: true,
  },
  {
    id: 'A1',
    productId: 'product_A1',
    title: 'Demo Kettle US',
    category: 'small_appliance',
    profile: profiles.appliance,
    manufacturerPartNumber: null,
    attributes: {
      type: synthetic('kettle'),
      capacity: synthetic(1.5, 'L'),
      widthMm: synthetic(220, 'mm'),
      depthMm: synthetic(160, 'mm'),
      heightMm: synthetic(230, 'mm'),
      voltage: synthetic(120, 'V'),
      frequency: synthetic(60, 'Hz'),
      plugRegion: synthetic('US'),
    },
    syntheticProduct: true,
  },
  {
    id: 'A2',
    productId: 'product_A2',
    title: 'Demo Kettle EU',
    category: 'small_appliance',
    profile: profiles.appliance,
    manufacturerPartNumber: null,
    attributes: {
      type: synthetic('kettle'),
      capacity: synthetic(1.5, 'L'),
      widthMm: synthetic(220, 'mm'),
      depthMm: synthetic(160, 'mm'),
      heightMm: synthetic(230, 'mm'),
      voltage: synthetic(230, 'V'),
      frequency: synthetic(50, 'Hz'),
      plugRegion: synthetic('EU'),
    },
    syntheticProduct: true,
  },
]

const variantById = new Map(variants.map((variant) => [variant.id, variant]))

const listing = (
  merchantId: Id,
  variantId: Id,
  referenceUnitCents: number,
  operatorFloorCents: number,
  initialQuantity: number,
  condition: 'new' | 'refurbished' = 'new',
): Listing => ({
  listing: ref(`${merchantId}:${variantId}`),
  merchantId,
  variantId,
  condition,
  unitId: null,
  initialQuantity,
  referenceUnitCents,
  operatorFloorCents,
  diagnosticAttributes: {},
})

const laptopListings: Record<Id, Array<[Id, number, number, number, 'new' | 'refurbished']>> = {
  merchant_a: [
    ['P1', 62_000, 58_000, 1, 'refurbished'],
    ['P3', 99_000, 95_000, 2, 'new'],
    ['P5', 69_000, 65_000, 1, 'refurbished'],
    ['P6', 48_000, 45_000, 1, 'refurbished'],
  ],
  merchant_b: [
    ['P2', 75_000, 71_000, 1, 'refurbished'],
    ['P3', 102_000, 96_500, 1, 'new'],
    ['P5', 85_000, 81_000, 1, 'new'],
    ['P6', 55_000, 52_000, 2, 'new'],
  ],
  merchant_c: [
    ['P1', 61_000, 61_000, 1, 'refurbished'],
    ['P4', 109_000, 109_000, 1, 'new'],
    ['P5', 68_000, 68_000, 1, 'refurbished'],
    ['P6', 46_000, 46_000, 1, 'refurbished'],
  ],
}

const nonTechListings: Record<Id, Array<[Id, number]>> = {
  merchant_a: [['C1', 2_500], ['C2', 3_000], ['H1', 8_000], ['H2', 10_000], ['A1', 4_500], ['A2', 4_000]],
  merchant_b: [['C1', 2_500], ['C2', 3_000], ['H1', 8_000], ['H2', 10_000], ['A1', 4_500], ['A2', 4_000]],
  merchant_c: [['C1', 2_500], ['C2', 3_000], ['H1', 8_000], ['H2', 10_000], ['A1', 4_500], ['A2', 4_000]],
}

export interface SellerFixtureSet {
  variants: CatalogVariant[]
  snapshotsByMerchant: Record<Id, CatalogSnapshot[]>
  policiesByMerchant: Record<Id, PricingPolicy>
  briefs: {
    laptop: SellerBrief
    clothing: SellerBrief
    household: SellerBrief
    appliance: SellerBrief
  }
}

function makePolicy(merchantId: Id, shippingCents: number, arrivalCalendarDays: number, warrantyMonths: number, returnDays: number): PricingPolicy {
  const listings = [
    ...(laptopListings[merchantId] ?? []).map(([variantId, reference]) => [`${merchantId}:${variantId}`, reference] as const),
    ...(nonTechListings[merchantId] ?? []).map(([variantId, reference]) => [`${merchantId}:${variantId}`, reference] as const),
    [`${merchantId}:MOUSE`, 2_500] as const,
    [`${merchantId}:HUB`, 3_500] as const,
  ]
  return {
    policy: ref(`${merchantId}:policy`),
    merchantId,
    enabled: true,
    maxDiscountBps: merchantId === 'merchant_c' ? 0 : 1_000,
    unitCostByListing: Object.fromEntries(listings.map(([listingId, reference]) => [listingId, Math.floor(reference * 0.8)])),
    minimumContributionByListing: Object.fromEntries(listings.map(([listingId, reference]) => [listingId, Math.ceil(reference * 0.05)])),
    costsAreSynthetic: true,
    shippingCents,
    arrivalCalendarDays,
    warrantyMonths,
    returnDays,
  }
}

function makeSnapshots(merchantId: Id): CatalogSnapshot[] {
  const snapshots: CatalogSnapshot[] = []
  for (const [variantId, reference, floor, quantity, condition] of laptopListings[merchantId] ?? []) {
    const variant = variantById.get(variantId)
    if (variant) snapshots.push({ variant, listing: listing(merchantId, variantId, reference, floor, quantity, condition), availableQuantity: quantity })
  }
  for (const [variantId, reference] of nonTechListings[merchantId] ?? []) {
    const variant = variantById.get(variantId)
    if (variant) snapshots.push({ variant, listing: listing(merchantId, variantId, reference, Math.floor(reference * 0.9), 5), availableQuantity: 5 })
  }
  const mouse = variantById.get('MOUSE')
  const hub = variantById.get('HUB')
  if (mouse) snapshots.push({ variant: mouse, listing: listing(merchantId, 'MOUSE', 2_500, merchantId === 'merchant_c' ? 2_500 : 2_300, 10), availableQuantity: 10 })
  if (hub) snapshots.push({ variant: hub, listing: listing(merchantId, 'HUB', 3_500, merchantId === 'merchant_c' ? 3_500 : 3_200, 10), availableQuantity: 10 })
  return snapshots
}

export function makeSellerFixtures(): SellerFixtureSet {
  return {
    variants,
    snapshotsByMerchant: {
      merchant_a: makeSnapshots('merchant_a'),
      merchant_b: makeSnapshots('merchant_b'),
      merchant_c: makeSnapshots('merchant_c'),
    },
    policiesByMerchant: {
      merchant_a: makePolicy('merchant_a', 1_500, 3, 12, 14),
      merchant_b: makePolicy('merchant_b', 0, 1, 24, 30),
      merchant_c: makePolicy('merchant_c', 0, 2, 12, 14),
    },
    briefs: {
      laptop: demoSellerBrief,
      clothing: clothingBrief,
      household: householdBrief,
      appliance: applianceBrief,
    },
  }
}

export function makeValidProposal(
  merchantId: Id,
  jobId = 'job_demo_1',
  candidateId = `${merchantId}:candidate:1`,
): SellerProposal {
  const listingId = `${merchantId}:P3`
  const policyId = `${merchantId}:policy`
  const unitCents = merchantId === 'merchant_a' ? 97_500 : merchantId === 'merchant_b' ? 97_000 : 102_000
  return {
    schemaVersion: 1,
    jobId,
    candidateId,
    parentOffer: null,
    policy: ref(policyId),
    lines: [{ requestLineId: 'line_main', listing: ref(listingId), quantity: 1, unitCents }],
    claims: [],
    fitArgument: 'Matches the confirmed laptop requirements using synthetic catalog facts.',
    privatePriceRationale: 'Synthetic fixture rationale; not exposed to buyers.',
  }
}

export function briefWithoutPrivateBudget(brief: ConfirmedBrief, runId: Id): SellerBrief {
  return buildSellerBrief(brief, runId)
}
