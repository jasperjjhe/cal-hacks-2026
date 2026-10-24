import { internalMutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { makeSellerFixtures, profiles } from './lib/sellerFixtures.ts'
import type { ProfileField } from './lib/sellerContracts.ts'
import { throwSellerError, type SellerMutationCtx } from './sellerAuth.ts'

function field(
  id: string,
  label: string,
  kind: ProfileField['kind'],
  unit: string | null,
  allowedOperators: ProfileField['allowedOperators'],
  allowedValues: string[] | null = null,
  minimum: number | null = null,
  maximum: number | null = null,
): ProfileField {
  return { id, label, kind, unit, allowedOperators, allowedValues, minimum, maximum }
}

const profileRows = [
  {
    profile: profiles.laptop,
    category: 'laptop' as const,
    allowedConditions: ['new', 'refurbished'] as const,
    fields: [
      field('osFamily', 'Operating system family', 'string', null, ['equals', 'in'], ['macOS', 'Windows', 'Linux']),
      field('ramGb', 'Memory', 'number', 'GB', ['min', 'max'], null, 1, 1_024),
      field('storageGb', 'Storage', 'number', 'GB', ['min', 'max'], null, 1, 16_384),
      field('weightG', 'Weight', 'number', 'g', ['min', 'max'], null, 1, 20_000),
      field('charging', 'Charging interface', 'string', null, ['equals', 'in']),
      field('healthPercent', 'Refurbished health', 'number', '%', ['min', 'max'], null, 1, 100),
    ],
    variantKeyFields: ['manufacturerPartNumber', 'ramGb', 'storageGb'],
    compatibilityRuleId: 'fixture:tech-accessory-v1',
    evidenceRuleId: 'fixture:laptop-evidence-v1',
  },
  {
    profile: profiles.accessory,
    category: 'tech_accessory' as const,
    allowedConditions: ['new', 'refurbished'] as const,
    fields: [
      field('compatibleVariantIds', 'Compatible variants', 'string_array', null, ['containsAll']),
    ],
    variantKeyFields: ['compatibleVariantIds'],
    compatibilityRuleId: 'fixture:tech-accessory-v1',
    evidenceRuleId: 'fixture:accessory-evidence-v1',
  },
  {
    profile: profiles.clothing,
    category: 'clothing' as const,
    allowedConditions: ['new'] as const,
    fields: [
      field('brand', 'Brand', 'string', null, ['equals', 'in']),
      field('sizeSystem', 'Size system', 'string', null, ['equals']),
      field('sizeLabel', 'Size label', 'string', null, ['equals', 'in']),
      field('color', 'Color', 'string', null, ['equals', 'in']),
      field('material', 'Material', 'string_array', null, ['containsAll']),
      field('chestMm', 'Chest measurement', 'number', 'mm', ['min', 'max'], null, 1, 10_000),
      field('lengthMm', 'Length measurement', 'number', 'mm', ['min', 'max'], null, 1, 10_000),
    ],
    variantKeyFields: ['brand', 'sizeSystem', 'sizeLabel', 'color'],
    compatibilityRuleId: null,
    evidenceRuleId: 'fixture:clothing-evidence-v1',
  },
  {
    profile: profiles.household,
    category: 'household_accessory' as const,
    allowedConditions: ['new', 'refurbished'] as const,
    fields: [
      field('type', 'Household type', 'string', null, ['equals', 'in']),
      field('dimensions', 'Dimensions', 'string_array', 'mm', ['containsAll']),
      field('material', 'Material', 'string', null, ['equals', 'in']),
      field('color', 'Color', 'string', null, ['equals', 'in']),
      field('mounting', 'Mounting/interface', 'string', null, ['equals', 'in']),
      field('widthMm', 'Width', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
      field('depthMm', 'Depth', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
      field('heightMm', 'Height', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
    ],
    variantKeyFields: ['type', 'widthMm', 'depthMm', 'heightMm'],
    compatibilityRuleId: null,
    evidenceRuleId: 'fixture:household-evidence-v1',
  },
  {
    profile: profiles.appliance,
    category: 'small_appliance' as const,
    allowedConditions: ['new', 'refurbished'] as const,
    fields: [
      field('type', 'Appliance type', 'string', null, ['equals', 'in']),
      field('capacity', 'Capacity', 'number', 'L', ['min', 'max'], null, 0, 10_000),
      field('widthMm', 'Width', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
      field('depthMm', 'Depth', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
      field('heightMm', 'Height', 'number', 'mm', ['min', 'max'], null, 1, 100_000),
      field('voltage', 'Voltage', 'number', 'V', ['equals', 'min', 'max'], null, 1, 1_000),
      field('frequency', 'Frequency', 'number', 'Hz', ['equals', 'min', 'max'], null, 1, 1_000),
      field('plugRegion', 'Plug region', 'string', null, ['equals', 'in'], ['US', 'EU']),
    ],
    variantKeyFields: ['type', 'voltage', 'frequency', 'plugRegion'],
    compatibilityRuleId: null,
    evidenceRuleId: 'fixture:appliance-evidence-v1',
  },
]

export const seedSellerDemo = internalMutationGeneric({
  args: { seedRevision: v.string() },
  handler: async (ctx: SellerMutationCtx, args: { seedRevision: string }) => {
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(args.seedRevision)) throwSellerError('INVALID_INPUT', 'seed revision is invalid', 'seedRevision')
    const prior = await ctx.db
      .query('seedRuns')
      .withIndex('by_seedRevision', (query) => query.eq('seedRevision', args.seedRevision))
      .collect()
    if (prior.length > 0) return { seedRevision: args.seedRevision, replayed: true, merchants: ['merchant_a', 'merchant_b', 'merchant_c'] }
    const existingMerchants = await ctx.db.query('merchants').collect()
    if (existingMerchants.length > 0) throwSellerError('REPLAY_REJECTED', 'demo seed only runs against an empty seller database')

    const fixtures = makeSellerFixtures()
    const createdAt = Date.now()
    for (const row of profileRows) {
      await ctx.db.insert('categoryProfiles', {
        profileId: row.profile.id,
        version: row.profile.version,
        category: row.category,
        allowedConditions: [...row.allowedConditions],
        fields: row.fields,
        variantKeyFields: row.variantKeyFields,
        compatibilityRuleId: row.compatibilityRuleId,
        evidenceRuleId: row.evidenceRuleId,
        createdAt,
      })
    }

    const productIds = new Set<string>()
    for (const variant of fixtures.variants) {
      if (!productIds.has(variant.productId)) {
        productIds.add(variant.productId)
        await ctx.db.insert('products', {
          productId: variant.productId,
          title: variant.title,
          category: variant.category,
          profile: variant.profile,
          manufacturerPartNumber: variant.manufacturerPartNumber,
          syntheticProduct: variant.syntheticProduct,
          createdAt,
        })
      }
      await ctx.db.insert('variants', {
        variantId: variant.id,
        productId: variant.productId,
        title: variant.title,
        category: variant.category,
        profile: variant.profile,
        manufacturerPartNumber: variant.manufacturerPartNumber,
        attributes: variant.attributes,
        syntheticProduct: variant.syntheticProduct,
        createdAt,
      })
    }

    for (const merchantId of ['merchant_a', 'merchant_b', 'merchant_c']) {
      const policy = fixtures.policiesByMerchant[merchantId]
      await ctx.db.insert('merchants', {
        merchantId,
        displayName: `Demo Merchant ${merchantId.slice(-1).toUpperCase()}`,
        enabled: true,
        paused: false,
        currentPolicyId: policy.policy.id,
        currentPolicyVersion: policy.policy.version,
        createdAt,
        updatedAt: createdAt,
      })
      await ctx.db.insert('memberships', {
        authSubject: `demo:${merchantId}`,
        merchantId,
        role: 'owner',
        enabled: true,
        createdAt,
      })
      await ctx.db.insert('policyVersions', {
        policyId: policy.policy.id,
        merchantId,
        version: policy.policy.version,
        enabled: policy.enabled,
        maxDiscountBps: policy.maxDiscountBps,
        unitCostByListing: policy.unitCostByListing,
        minimumContributionByListing: policy.minimumContributionByListing,
        costsAreSynthetic: policy.costsAreSynthetic,
        shippingCents: policy.shippingCents,
        arrivalCalendarDays: policy.arrivalCalendarDays,
        warrantyMonths: policy.warrantyMonths,
        returnDays: policy.returnDays,
        createdAt,
      })
      for (const snapshot of fixtures.snapshotsByMerchant[merchantId]) {
        await ctx.db.insert('listingVersions', {
          listingId: snapshot.listing.listing.id,
          merchantId,
          version: snapshot.listing.listing.version,
          variantId: snapshot.listing.variantId,
          condition: snapshot.listing.condition,
          unitId: snapshot.listing.unitId,
          initialQuantity: snapshot.listing.initialQuantity,
          referenceUnitCents: snapshot.listing.referenceUnitCents,
          operatorFloorCents: snapshot.listing.operatorFloorCents,
          diagnosticAttributes: snapshot.listing.diagnosticAttributes,
          enabled: true,
          createdAt,
        })
      }
    }
    await ctx.db.insert('seedRuns', { seedRevision: args.seedRevision, mode: 'fixture', createdAt })
    return { seedRevision: args.seedRevision, replayed: false, merchants: ['merchant_a', 'merchant_b', 'merchant_c'] }
  },
})
