import { internalMutation } from './_generated/server'
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
  {
    profile: profiles.headphones,
    category: 'headphones' as const,
    allowedConditions: ['new'] as const,
    fields: [
      field('brand', 'Brand', 'string', null, ['equals', 'in']),
      field('headphoneType', 'Headphone type', 'string', null, ['equals', 'in'], ['over-ear', 'on-ear', 'in-ear']),
      field('color', 'Color', 'string', null, ['equals', 'in']),
      field('noiseCancelling', 'Active noise cancelling', 'boolean', null, ['equals']),
      field('batteryHours', 'Battery life with noise cancelling on', 'number', 'h', ['min', 'max'], null, 1, 500),
      field('weightG', 'Weight', 'number', 'g', ['min', 'max'], null, 1, 2_000),
      field('ancTier', 'Noise cancelling strength (reviewer consensus)', 'string', null, ['equals', 'in'], ['best_in_class', 'excellent', 'good']),
    ],
    variantKeyFields: ['manufacturerPartNumber', 'color'],
    compatibilityRuleId: null,
    evidenceRuleId: 'fixture:headphones-evidence-v1',
  },
]

export const seedSellerDemo = internalMutation({
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
        authTokenIdentifier: `demo:${merchantId}`,
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
        finalServiceOptions: policy.finalServiceOptions,
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

// Idempotent migration that converges an already-seeded database to the headphone fixtures:
// upserts the profile, products and variants, publishes new listing/policy versions only when
// values changed, and disables headphone listings that are no longer part of the fixtures.
export const seedHeadphoneCatalog = internalMutation({
  args: {},
  handler: async (ctx: SellerMutationCtx) => {
    const fixtures = makeSellerFixtures()
    const createdAt = Date.now()
    const row = profileRows.find((candidate) => candidate.category === 'headphones')!
    const summary = { profile: 'unchanged', variantsWritten: 0, listingsPublished: 0, listingsDisabled: 0, policiesPublished: 0 }
    // Convex does not preserve object key order, so compare with sorted keys.
    const stable = (value: unknown): string =>
      JSON.stringify(value, (_key, nested) =>
        nested && typeof nested === 'object' && !Array.isArray(nested)
          ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
          : nested,
      )
    const same = (left: unknown, right: unknown) => stable(left) === stable(right)

    const profileDoc = await ctx.db
      .query('categoryProfiles')
      .withIndex('by_profileId_and_version', (query) => query.eq('profileId', row.profile.id).eq('version', row.profile.version))
      .first()
    const profileValue = {
      allowedConditions: [...row.allowedConditions],
      fields: row.fields,
      variantKeyFields: row.variantKeyFields,
      compatibilityRuleId: row.compatibilityRuleId,
      evidenceRuleId: row.evidenceRuleId,
    }
    if (!profileDoc) {
      await ctx.db.insert('categoryProfiles', { profileId: row.profile.id, version: row.profile.version, category: row.category, ...profileValue, createdAt })
      summary.profile = 'created'
    } else if (!same(profileDoc.fields, row.fields)) {
      await ctx.db.patch(profileDoc._id, profileValue)
      summary.profile = 'updated'
    }

    const headphoneVariants = fixtures.variants.filter((candidate) => candidate.category === 'headphones')
    for (const variant of headphoneVariants) {
      const productValue = {
        title: variant.title,
        category: variant.category,
        profile: variant.profile,
        manufacturerPartNumber: variant.manufacturerPartNumber,
        syntheticProduct: variant.syntheticProduct,
      }
      const product = await ctx.db.query('products').withIndex('by_productId', (query) => query.eq('productId', variant.productId)).first()
      if (!product) await ctx.db.insert('products', { productId: variant.productId, ...productValue, createdAt })
      else if (!same({ ...productValue }, { title: product.title, category: product.category, profile: product.profile, manufacturerPartNumber: product.manufacturerPartNumber, syntheticProduct: product.syntheticProduct })) await ctx.db.patch(product._id, productValue)
      const variantValue = { ...productValue, productId: variant.productId, attributes: variant.attributes }
      const existing = await ctx.db.query('variants').withIndex('by_variantId', (query) => query.eq('variantId', variant.id)).first()
      if (!existing) {
        await ctx.db.insert('variants', { variantId: variant.id, ...variantValue, createdAt })
        summary.variantsWritten += 1
      } else if (!same(variant.attributes, existing.attributes) || existing.title !== variant.title || existing.syntheticProduct !== variant.syntheticProduct) {
        await ctx.db.patch(existing._id, variantValue)
        summary.variantsWritten += 1
      }
    }

    const headphoneVariantIds = new Set(headphoneVariants.map((variant) => variant.id))
    for (const merchantId of ['merchant_a', 'merchant_b', 'merchant_c']) {
      const merchant = await ctx.db.query('merchants').withIndex('by_merchantId', (query) => query.eq('merchantId', merchantId)).first()
      if (!merchant) continue
      const desired = fixtures.snapshotsByMerchant[merchantId].filter((snapshot) => snapshot.variant.category === 'headphones')
      const desiredIds = new Set(desired.map((snapshot) => snapshot.listing.listing.id))

      const allListings = await ctx.db.query('listingVersions').filter((query) => query.eq(query.field('merchantId'), merchantId)).collect()
      for (const stale of allListings.filter((doc) => headphoneVariantIds.has(doc.variantId) && doc.enabled && !desiredIds.has(doc.listingId))) {
        await ctx.db.patch(stale._id, { enabled: false })
        summary.listingsDisabled += 1
      }

      for (const snapshot of desired) {
        const listingRef = snapshot.listing.listing
        const versions = allListings.filter((doc) => doc.listingId === listingRef.id).sort((left, right) => right.version - left.version)
        const latest = versions[0]
        const value = {
          listingId: listingRef.id,
          merchantId,
          variantId: snapshot.listing.variantId,
          condition: snapshot.listing.condition,
          unitId: snapshot.listing.unitId,
          initialQuantity: snapshot.listing.initialQuantity,
          referenceUnitCents: snapshot.listing.referenceUnitCents,
          operatorFloorCents: snapshot.listing.operatorFloorCents,
          diagnosticAttributes: snapshot.listing.diagnosticAttributes,
          enabled: true,
          createdAt,
        }
        if (!latest) {
          await ctx.db.insert('listingVersions', { ...value, version: listingRef.version })
          summary.listingsPublished += 1
        } else if (!latest.enabled || latest.referenceUnitCents !== value.referenceUnitCents || latest.operatorFloorCents !== value.operatorFloorCents || latest.initialQuantity !== value.initialQuantity) {
          await ctx.db.patch(latest._id, { enabled: false })
          await ctx.db.insert('listingVersions', { ...value, version: latest.version + 1 })
          summary.listingsPublished += 1
        }
      }

      const current = await ctx.db
        .query('policyVersions')
        .withIndex('by_policyId_and_version', (query) => query.eq('policyId', merchant.currentPolicyId!).eq('version', merchant.currentPolicyVersion))
        .first()
      if (!current) continue
      const seeded = fixtures.policiesByMerchant[merchantId]
      const changed = [...desiredIds].filter(
        (id) => current.unitCostByListing[id] !== seeded.unitCostByListing[id] || current.minimumContributionByListing[id] !== seeded.minimumContributionByListing[id],
      )
      if (changed.length === 0) continue
      const next = {
        policyId: current.policyId,
        merchantId: current.merchantId,
        version: current.version + 1,
        enabled: current.enabled,
        maxDiscountBps: current.maxDiscountBps,
        unitCostByListing: { ...current.unitCostByListing, ...Object.fromEntries(changed.map((id) => [id, seeded.unitCostByListing[id]])) },
        minimumContributionByListing: { ...current.minimumContributionByListing, ...Object.fromEntries(changed.map((id) => [id, seeded.minimumContributionByListing[id]])) },
        costsAreSynthetic: current.costsAreSynthetic,
        shippingCents: current.shippingCents,
        arrivalCalendarDays: current.arrivalCalendarDays,
        warrantyMonths: current.warrantyMonths,
        returnDays: current.returnDays,
        finalServiceOptions: current.finalServiceOptions,
        createdAt,
      }
      await ctx.db.insert('policyVersions', next)
      await ctx.db.patch(merchant._id, { currentPolicyId: next.policyId, currentPolicyVersion: next.version, updatedAt: createdAt })
      summary.policiesPublished += 1
    }
    return summary
  },
})
