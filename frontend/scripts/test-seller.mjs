import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertSellerBriefSafe,
  buildSellerBrief,
  parseSellerDecision,
  SellerContractError,
} from '../convex/lib/sellerContracts.ts'
import { makeSellerFixtures, makeValidProposal } from '../convex/lib/sellerFixtures.ts'
import {
  applyPolicyChanges,
  assessLine,
  minimumUnitCents,
  resolveFinalServiceTerms,
  validateFinalOfferRevision,
  validateSellerProposal,
} from '../convex/lib/sellerValidation.ts'
import {
  availableQuantity,
  reserveInTransaction,
  releaseExpiredReservations,
  transitionAllocationInTransaction,
} from '../convex/lib/sellerInventory.ts'
import { FixtureAgentPort } from '../convex/integrations/fixtureAgentPort.ts'
import { createFetchAgentPort } from '../convex/integrations/fetchAdapter.ts'

const fixtures = makeSellerFixtures()

function contextFor(merchantId, brief = fixtures.briefs.laptop) {
  return {
    jobId: 'job_demo_1',
    merchantId,
    brief,
    policy: fixtures.policiesByMerchant[merchantId],
    candidates: [`${merchantId}:candidate:1`, `${merchantId}:candidate:2`],
    catalog: fixtures.snapshotsByMerchant[merchantId],
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
  }
}

function proposalFor(merchantId, variantId, unitCents, requestLineId = 'line_main') {
  return {
    ...makeValidProposal(merchantId),
    lines: [{
      requestLineId,
      listing: { id: `${merchantId}:${variantId}`, version: 1 },
      quantity: 1,
      unitCents,
    }],
  }
}

function openingOfferFor(merchantId = 'merchant_a', brief = fixtures.briefs.laptop) {
  const openingResult = validateSellerProposal(contextFor(merchantId, brief), makeValidProposal(merchantId))
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) throw new Error('opening fixture must validate')
  return {
    offer: { id: `offer_demo_${merchantId}_candidate_1`, version: 1 },
    ...openingResult.offer,
  }
}

function finalContextFor(openingOffer, overrides = {}) {
  return {
    jobId: openingOffer.jobId,
    merchantId: openingOffer.merchantId,
    candidateId: openingOffer.candidateId,
    brief: fixtures.briefs.laptop,
    openingOffer,
    openingCatalog: fixtures.snapshotsByMerchant[openingOffer.merchantId],
    currentCatalog: fixtures.snapshotsByMerchant[openingOffer.merchantId],
    policy: fixtures.policiesByMerchant[openingOffer.merchantId],
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
    ...overrides,
  }
}

function finalCandidateFor(openingOffer, overrides = {}) {
  return {
    candidateId: openingOffer.candidateId,
    parentOffer: { ...openingOffer.offer },
    policy: { ...openingOffer.policy },
    serviceOptionId: null,
    lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 96_000 })),
    ...overrides,
  }
}

test('seller brief construction excludes private buyer fields', () => {
  const brief = buildSellerBrief({
    schemaVersion: 1,
    request: { id: 'req_test', version: 1 },
    currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO',
    deliveryDeadline: Date.parse('2026-11-01T00:00:00.000Z'),
    lines: fixtures.briefs.laptop.lines,
    sharedTarget: null,
  }, 'run_test')
  assert.equal('privateMaximumCents' in brief, false)
  assert.doesNotThrow(() => assertSellerBriefSafe(brief))
  assert.throws(
    () => assertSellerBriefSafe({ ...brief, privateMaximumCents: 100_000 }),
    (error) => error instanceof SellerContractError && error.code === 'INVALID_INPUT',
  )
})

test('minimum price follows the documented floor, discount and contribution formula', () => {
  assert.equal(minimumUnitCents({
    referenceUnitCents: 99_000,
    operatorFloorCents: 95_000,
    maxDiscountBps: 1_000,
    unitCostCents: 79_200,
    minimumContributionCents: 4_950,
  }), 95_000)
  assert.equal(minimumUnitCents({
    referenceUnitCents: 100,
    operatorFloorCents: 1,
    maxDiscountBps: 333,
    unitCostCents: 1,
    minimumContributionCents: 1,
  }), 97)
  assert.throws(
    () => minimumUnitCents({
      referenceUnitCents: Number.MAX_SAFE_INTEGER,
      operatorFloorCents: 0,
      maxDiscountBps: 0,
      unitCostCents: 0,
      minimumContributionCents: 0,
    }),
    SellerContractError,
  )
})

test('final service terms come only from the immutable policy allowlist', () => {
  const baseline = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baseline, {
    finalServiceOptions: [{
      id: 'service:priority',
      shippingCents: 2_000,
      arrivalCalendarDays: 1,
      warrantyMonths: 24,
      returnDays: 30,
      incrementalCostCents: 500,
    }],
  }, baseline.policy.version + 1)

  assert.deepEqual(resolveFinalServiceTerms(policy, null), {
    serviceOptionId: null,
    shippingCents: baseline.shippingCents,
    arrivalCalendarDays: baseline.arrivalCalendarDays,
    warrantyMonths: baseline.warrantyMonths,
    returnDays: baseline.returnDays,
    incrementalCostCents: 0,
  })
  assert.deepEqual(resolveFinalServiceTerms(policy, 'service:priority'), {
    serviceOptionId: 'service:priority',
    shippingCents: 2_000,
    arrivalCalendarDays: 1,
    warrantyMonths: 24,
    returnDays: 30,
    incrementalCostCents: 500,
  })
  assert.throws(
    () => resolveFinalServiceTerms(policy, 'service:unapproved'),
    (error) => error instanceof Error && error.message.includes('not authorized by policy'),
  )
  assert.throws(
    () => resolveFinalServiceTerms(policy, undefined),
    (error) => error instanceof Error && error.message.includes('service option ID is invalid'),
  )
  assert.throws(
    () => applyPolicyChanges(baseline, {
      finalServiceOptions: [{
        id: 'service:bad',
        shippingCents: 0,
        arrivalCalendarDays: 1,
        warrantyMonths: 12,
        returnDays: 14,
        incrementalCostCents: -1,
      }],
    }, baseline.policy.version + 1),
    (error) => error instanceof Error && error.message.includes('incremental bundle cost'),
  )
})

test('valid seller proposals are recomputed and never trust model totals', () => {
  const result = validateSellerProposal(contextFor('merchant_a'), makeValidProposal('merchant_a'))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.offer.itemsCents, 97_500)
  assert.equal(result.offer.serviceOptionId, null)
  assert.equal(result.offer.shippingCents, 1_500)
  assert.equal(result.offer.totalCents, 99_000)
  assert.equal(result.offer.fit.hardRequirementsPassed, true)
})

test('final seller revisions stay parent-bound while allowing a validated price reduction', () => {
  const openingResult = validateSellerProposal(contextFor('merchant_a'), makeValidProposal('merchant_a'))
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_candidate_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision({
    jobId: openingOffer.jobId,
    merchantId: openingOffer.merchantId,
    candidateId: openingOffer.candidateId,
    brief: fixtures.briefs.laptop,
    openingOffer,
    openingCatalog: fixtures.snapshotsByMerchant.merchant_a,
    currentCatalog: fixtures.snapshotsByMerchant.merchant_a,
    policy: fixtures.policiesByMerchant.merchant_a,
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
  }, {
    candidateId: openingOffer.candidateId,
    parentOffer: { ...openingOffer.offer },
    policy: { ...openingOffer.policy },
    serviceOptionId: null,
    lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 96_000 })),
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.offer.parentOffer?.id, openingOffer.offer.id)
  assert.equal(result.offer.itemsCents, 96_000)
  assert.equal(result.offer.totalCents, 97_500)
  assert.equal(result.offer.serviceOptionId, null)
})

test('final seller revisions re-check the seller brief instead of trusting opening fit', () => {
  const openingResult = validateSellerProposal(contextFor('merchant_a'), makeValidProposal('merchant_a'))
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_candidate_1', version: 1 },
    ...openingResult.offer,
  }
  const stricterBrief = {
    ...fixtures.briefs.laptop,
    lines: [{
      ...fixtures.briefs.laptop.lines[0],
      requirements: [
        ...fixtures.briefs.laptop.lines[0].requirements,
        { id: 'r_health', fieldId: 'healthPercent', operator: 'min', value: 99, unit: '%', strength: 'hard', weight: 1 },
      ],
    }],
  }
  const result = validateFinalOfferRevision({
    jobId: openingOffer.jobId,
    merchantId: openingOffer.merchantId,
    candidateId: openingOffer.candidateId,
    brief: stricterBrief,
    openingOffer,
    openingCatalog: fixtures.snapshotsByMerchant.merchant_a,
    currentCatalog: fixtures.snapshotsByMerchant.merchant_a,
    policy: fixtures.policiesByMerchant.merchant_a,
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
  }, {
    candidateId: openingOffer.candidateId,
    parentOffer: { ...openingOffer.offer },
    policy: { ...openingOffer.policy },
    serviceOptionId: null,
    lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 96_000 })),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'REQUIREMENT_NOT_MET'))
})

test('final seller revisions reject a changed listing price identity even when the new price would pass', () => {
  const openingResult = validateSellerProposal(contextFor('merchant_a'), makeValidProposal('merchant_a'))
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_candidate_1', version: 1 },
    ...openingResult.offer,
  }
  const currentCatalog = fixtures.snapshotsByMerchant.merchant_a.map((snapshot) => snapshot.listing.listing.id === 'merchant_a:P3'
    ? {
      ...snapshot,
      listing: { ...snapshot.listing, referenceUnitCents: 100_000, operatorFloorCents: 90_000 },
    }
    : snapshot)
  const result = validateFinalOfferRevision({
    jobId: openingOffer.jobId,
    merchantId: openingOffer.merchantId,
    candidateId: openingOffer.candidateId,
    brief: fixtures.briefs.laptop,
    openingOffer,
    openingCatalog: fixtures.snapshotsByMerchant.merchant_a,
    currentCatalog,
    policy: fixtures.policiesByMerchant.merchant_a,
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
  }, {
    candidateId: openingOffer.candidateId,
    parentOffer: { ...openingOffer.offer },
    policy: { ...openingOffer.policy },
    serviceOptionId: null,
    lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 96_000 })),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'FROZEN_BASKET_CHANGED'))
})

test('final seller revisions reject non-integer quantities before doing money arithmetic', () => {
  const openingResult = validateSellerProposal(contextFor('merchant_a'), makeValidProposal('merchant_a'))
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_candidate_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision({
    jobId: openingOffer.jobId,
    merchantId: openingOffer.merchantId,
    candidateId: openingOffer.candidateId,
    brief: fixtures.briefs.laptop,
    openingOffer,
    openingCatalog: fixtures.snapshotsByMerchant.merchant_a,
    currentCatalog: fixtures.snapshotsByMerchant.merchant_a,
    policy: fixtures.policiesByMerchant.merchant_a,
    now: Date.parse('2026-10-24T12:00:00.000Z'),
    mode: 'fixture',
  }, {
    candidateId: openingOffer.candidateId,
    parentOffer: { ...openingOffer.offer },
    policy: { ...openingOffer.policy },
    serviceOptionId: null,
    lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, quantity: 1.5 })),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'QUANTITY_INVALID'))
})

test('final seller revisions cannot escape the opening parent offer', () => {
  const openingOffer = openingOfferFor()
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer),
    finalCandidateFor(openingOffer, { parentOffer: { id: openingOffer.offer.id, version: 2 } }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'PARENT_OFFER_MISMATCH'))
})

test('final seller revisions cannot invent a service option outside policy authority', () => {
  const openingOffer = openingOfferFor()
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer),
    finalCandidateFor(openingOffer, { serviceOptionId: 'service:unapproved' }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'INVALID_INPUT' && reason.field === 'serviceOptionId'))
})

test('final seller revisions recompute an authorized service option and its incremental economics', () => {
  const baselinePolicy = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baselinePolicy, {
    finalServiceOptions: [{
      id: 'service:priority',
      shippingCents: 2_000,
      arrivalCalendarDays: 1,
      warrantyMonths: 24,
      returnDays: 30,
      incrementalCostCents: 500,
    }],
  }, baselinePolicy.policy.version + 1)
  const openingResult = validateSellerProposal({
    ...contextFor('merchant_a'),
    policy,
  }, {
    ...makeValidProposal('merchant_a'),
    policy: { ...policy.policy },
  })
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_priority_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy }),
    finalCandidateFor(openingOffer, { serviceOptionId: 'service:priority' }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.offer.serviceOptionId, 'service:priority')
  assert.equal(result.offer.shippingCents, 2_000)
  assert.equal(result.offer.totalCents, 98_000)
  assert.equal(result.offer.arrivalCalendarDays, 1)
  assert.equal(result.offer.warrantyMonths, 24)
  assert.equal(result.offer.returnDays, 30)
})

test('final seller revisions reject an option whose private bundle cost breaks contribution', () => {
  const baselinePolicy = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baselinePolicy, {
    finalServiceOptions: [{
      id: 'service:expensive',
      shippingCents: 1_500,
      arrivalCalendarDays: 3,
      warrantyMonths: 12,
      returnDays: 14,
      incrementalCostCents: 15_000,
    }],
  }, baselinePolicy.policy.version + 1)
  const openingResult = validateSellerProposal({
    ...contextFor('merchant_a'),
    policy,
  }, {
    ...makeValidProposal('merchant_a'),
    policy: { ...policy.policy },
  })
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_expensive_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy }),
    finalCandidateFor(openingOffer, {
      serviceOptionId: 'service:expensive',
      lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 95_000 })),
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'CONTRIBUTION_TOO_LOW'))
})

test('final seller revisions reject a delivered total increase even when the item price falls', () => {
  const baselinePolicy = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baselinePolicy, {
    finalServiceOptions: [{
      id: 'service:high-shipping',
      shippingCents: 5_000,
      arrivalCalendarDays: 3,
      warrantyMonths: 12,
      returnDays: 14,
      incrementalCostCents: 0,
    }],
  }, baselinePolicy.policy.version + 1)
  const openingResult = validateSellerProposal({
    ...contextFor('merchant_a'),
    policy,
  }, {
    ...makeValidProposal('merchant_a'),
    policy: { ...policy.policy },
  })
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_high_shipping_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy }),
    finalCandidateFor(openingOffer, {
      serviceOptionId: 'service:high-shipping',
      lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 96_000 })),
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'FINAL_TOTAL_INCREASED'))
})

test('final seller revisions reject weaker delivery, warranty or return terms', () => {
  const baselinePolicy = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baselinePolicy, {
    finalServiceOptions: [{
      id: 'service:weaker',
      shippingCents: 1_500,
      arrivalCalendarDays: 4,
      warrantyMonths: 11,
      returnDays: 13,
      incrementalCostCents: 0,
    }],
  }, baselinePolicy.policy.version + 1)
  const openingResult = validateSellerProposal({
    ...contextFor('merchant_a'),
    policy,
  }, {
    ...makeValidProposal('merchant_a'),
    policy: { ...policy.policy },
  })
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_weaker_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy }),
    finalCandidateFor(openingOffer, { serviceOptionId: 'service:weaker' }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'FINAL_TERM_WEAKENED'))
})

test('final seller revisions fail closed when the seller policy changes after opening', () => {
  const openingOffer = openingOfferFor()
  const currentPolicy = applyPolicyChanges(fixtures.policiesByMerchant.merchant_a, {
    maxDiscountBps: 500,
  }, fixtures.policiesByMerchant.merchant_a.policy.version + 1)
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy: currentPolicy }),
    finalCandidateFor(openingOffer),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'POLICY_VERSION_STALE'))
})

test('final seller revisions cannot raise an item price even with a lower shipping option', () => {
  const baselinePolicy = fixtures.policiesByMerchant.merchant_a
  const policy = applyPolicyChanges(baselinePolicy, {
    finalServiceOptions: [{
      id: 'service:free-shipping',
      shippingCents: 0,
      arrivalCalendarDays: 3,
      warrantyMonths: 12,
      returnDays: 14,
      incrementalCostCents: 0,
    }],
  }, baselinePolicy.policy.version + 1)
  const openingResult = validateSellerProposal({
    ...contextFor('merchant_a'),
    policy,
  }, {
    ...makeValidProposal('merchant_a'),
    policy: { ...policy.policy },
  })
  assert.equal(openingResult.ok, true)
  if (!openingResult.ok) return
  const openingOffer = {
    offer: { id: 'offer_demo_merchant_a_free_shipping_1', version: 1 },
    ...openingResult.offer,
  }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer, { policy }),
    finalCandidateFor(openingOffer, {
      serviceOptionId: 'service:free-shipping',
      lines: openingOffer.lines.map((line) => ({ ...line, listing: { ...line.listing }, unitCents: 97_600 })),
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'FINAL_LINE_PRICE_INCREASED'))
})

test('final seller revisions require an accepted opening offer', () => {
  const openingOffer = { ...openingOfferFor(), status: 'hold' }
  const result = validateFinalOfferRevision(
    finalContextFor(openingOffer),
    finalCandidateFor(openingOffer),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'INVALID_INPUT' && reason.field === 'openingOffer.status'))
})

test('seller validation rejects wrong merchant, stale policy, invalid price and missing lines', () => {
  const wrongMerchant = {
    ...makeValidProposal('merchant_a'),
    lines: [{ requestLineId: 'line_main', listing: { id: 'merchant_b:P3', version: 1 }, quantity: 1, unitCents: 97_000 }],
  }
  const result = validateSellerProposal(contextFor('merchant_a'), wrongMerchant)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.reasons.some((reason) => reason.code === 'LISTING_VERSION_STALE' || reason.code === 'WRONG_MERCHANT_SCOPE'))

  const stale = validateSellerProposal(contextFor('merchant_a'), {
    ...makeValidProposal('merchant_a'),
    policy: { id: 'merchant_a:policy', version: 99 },
  })
  assert.equal(stale.ok, false)
  if (stale.ok) return
  assert.ok(stale.reasons.some((reason) => reason.code === 'POLICY_VERSION_STALE'))

  const belowFloor = validateSellerProposal(contextFor('merchant_a'), proposalFor('merchant_a', 'P3', 94_999))
  assert.equal(belowFloor.ok, false)
  if (belowFloor.ok) return
  assert.ok(belowFloor.reasons.some((reason) => reason.code === 'PRICE_BELOW_FLOOR'))

  const missing = validateSellerProposal(contextFor('merchant_a'), {
    ...makeValidProposal('merchant_a'),
    lines: [],
  })
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.ok(missing.reasons.some((reason) => reason.code === 'MISSING_LINE'))
})

test('required profile fixtures reject P6, C2, H2 and A2', () => {
  const p6 = validateSellerProposal(contextFor('merchant_a'), proposalFor('merchant_a', 'P6', 47_000))
  assert.equal(p6.ok, false)
  if (!p6.ok) assert.ok(p6.reasons.some((reason) => reason.code === 'CONDITION_NOT_ALLOWED' || reason.code === 'REQUIREMENT_NOT_MET'))

  const c2 = validateSellerProposal(contextFor('merchant_a', fixtures.briefs.clothing), proposalFor('merchant_a', 'C2', 3_000, 'line_clothing'))
  assert.equal(c2.ok, false)
  if (!c2.ok) assert.ok(c2.reasons.some((reason) => reason.code === 'REQUIREMENT_NOT_MET'))

  const h2 = validateSellerProposal(contextFor('merchant_a', fixtures.briefs.household), proposalFor('merchant_a', 'H2', 9_000, 'line_household'))
  assert.equal(h2.ok, false)
  if (!h2.ok) assert.ok(h2.reasons.some((reason) => reason.code === 'REQUIREMENT_NOT_MET'))

  const a2 = validateSellerProposal(contextFor('merchant_a', fixtures.briefs.appliance), proposalFor('merchant_a', 'A2', 3_600, 'line_appliance'))
  assert.equal(a2.ok, false)
  if (!a2.ok) assert.ok(a2.reasons.some((reason) => reason.code === 'REQUIREMENT_NOT_MET'))
})

test('unknown mandatory facts fail closed while soft unknowns remain explainable', () => {
  const brief = {
    ...fixtures.briefs.laptop,
    lines: [{
      ...fixtures.briefs.laptop.lines[0],
      requirements: [{ id: 'r_health', fieldId: 'healthPercent', operator: 'min', value: 90, unit: '%', strength: 'hard', weight: 1 }],
    }],
  }
  const result = validateSellerProposal(contextFor('merchant_b', brief), proposalFor('merchant_b', 'P2', 74_000))
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.reasons.some((reason) => reason.code === 'REQUIREMENT_NOT_MET' || reason.code === 'UNKNOWN_REQUIRED_FACT'))
})

test('seller decision parser rejects extra fields and accepts hold/abstain shapes', () => {
  assert.deepEqual(parseSellerDecision({ kind: 'hold', jobId: 'job_1', offer: { id: 'offer_1', version: 1 } }), {
    kind: 'hold',
    jobId: 'job_1',
    offer: { id: 'offer_1', version: 1 },
  })
  assert.deepEqual(parseSellerDecision({ kind: 'abstain', jobId: 'job_1', reasonCode: 'NO_MATCH' }), {
    kind: 'abstain',
    jobId: 'job_1',
    reasonCode: 'NO_MATCH',
  })
  assert.throws(
    () => parseSellerDecision({ kind: 'abstain', jobId: 'job_1', reasonCode: 'NO_MATCH', privateMaximumCents: 1 }),
    SellerContractError,
  )
})

test('line assessment distinguishes hard failures, soft coverage and unknown facts', () => {
  const snapshot = fixtures.snapshotsByMerchant.merchant_a.find((entry) => entry.variant.id === 'P3')
  assert.ok(snapshot)
  const assessment = assessLine(fixtures.briefs.laptop.lines[0], snapshot)
  assert.equal(assessment.hardRequirementsPassed, true)
  assert.equal(assessment.coverage, 100)
})

test('reservation is atomic, contention-safe and idempotent', () => {
  const line = { requestLineId: 'line_main', listing: { id: 'listing:last', version: 1 }, quantity: 1, unitCents: 1_000 }
  const initial = { initialQuantityByListing: { 'listing:last': 1 }, allocations: [] }
  const first = reserveInTransaction(initial, {
    allocationIdPrefix: 'alloc:first',
    reservationKey: 'select:first',
    requestId: 'req_1',
    quoteId: 'quote_1',
    merchantId: 'merchant_a',
    lines: [line],
    expiresAt: 1_000,
    now: 100,
  })
  assert.equal(availableQuantity(first.state, 'listing:last', 200), 0)
  assert.throws(
    () => reserveInTransaction(first.state, {
      allocationIdPrefix: 'alloc:second',
      reservationKey: 'select:second',
      requestId: 'req_2',
      quoteId: 'quote_2',
      merchantId: 'merchant_b',
      lines: [line],
      expiresAt: 1_000,
      now: 200,
    }),
    (error) => error instanceof SellerContractError && error.code === 'QUANTITY_UNAVAILABLE',
  )
  const replay = reserveInTransaction(first.state, {
    allocationIdPrefix: 'alloc:first-retry',
    reservationKey: 'select:first',
    requestId: 'req_1',
    quoteId: 'quote_1',
    merchantId: 'merchant_a',
    lines: [line],
    expiresAt: 1_000,
    now: 200,
  })
  assert.equal(replay.replayed, true)
  const locked = transitionAllocationInTransaction(first.state, 'alloc:first:1', 'lock', 200)
  const sold = transitionAllocationInTransaction(locked, 'alloc:first:1', 'sell', 300)
  assert.equal(sold.allocations[0].state, 'sold')
})

test('expired reservations release without touching execution locks', () => {
  const state = {
    initialQuantityByListing: { listing: 2 },
    allocations: [{
      allocationId: 'alloc:reserved', reservationKey: 'key:1', requestId: 'req', quoteId: 'quote', merchantId: 'merchant',
      requestLineId: 'line', listingId: 'listing', listingVersion: 1, quantity: 1, unitCents: 10,
      state: 'reserved', expiresAt: 100, createdAt: 1,
    }, {
      allocationId: 'alloc:locked', reservationKey: 'key:2', requestId: 'req', quoteId: 'quote', merchantId: 'merchant',
      requestLineId: 'line2', listingId: 'listing', listingVersion: 1, quantity: 1, unitCents: 10,
      state: 'execution_locked', expiresAt: 100, createdAt: 1,
    }],
  }
  const released = releaseExpiredReservations(state, 100)
  assert.equal(released.allocations[0].state, 'released')
  assert.equal(released.allocations[1].state, 'execution_locked')
})

test('fixture provider exposes pending then completed behavior without pretending to be live', async () => {
  const port = new FixtureAgentPort(new Map([
    ['job_provider', [
      { status: 'pending', providerRunId: 'fixture-run-1' },
      { status: 'completed', providerRunId: 'fixture-run-1', output: { kind: 'abstain', jobId: 'job_provider', reasonCode: 'NO_MATCH' } }],
  ]]))
  const job = {
    jobId: 'job_provider', requestId: 'req_provider', requestVersion: 1, runId: 'run_provider', phaseId: 'phase_provider',
    role: 'seller_initial', merchantId: 'merchant_a', deadlineAt: Date.now() + 10_000, provider: 'fixture', inputDigest: 'sha256:fixture', inputRef: 'brief_provider',
  }
  const started = await port.start(job)
  assert.equal(started.status, 'pending')
  const completed = await port.poll(job.jobId)
  assert.equal(completed.status, 'completed')
  if (completed.status === 'completed') assert.equal(completed.providerRunId, 'fixture-run-1')
  await port.cancel(job.jobId)
  const cancelled = await port.poll(job.jobId)
  assert.equal(cancelled.status, 'failed')
})

test('HTTP provider adapter requires explicit HTTPS allowlists and sends only scoped input', async () => {
  assert.throws(
    () => createFetchAgentPort({
      provider: 'fetch',
      startUrl: 'http://agent.example/start',
      pollUrlTemplate: 'http://agent.example/runs/{providerRunId}',
      cancelUrlTemplate: 'http://agent.example/runs/{providerRunId}/cancel',
      allowedHosts: ['agent.example'],
      requestTimeoutMs: 5_000,
      providerConfigRevision: 'fetch-demo-v1',
    }, {
      getToken: async () => undefined,
      resolveInput: async () => fixtures.briefs.laptop,
      resolveProviderRunId: async () => null,
    }),
    /HTTPS/,
  )

  let requestBody
  const port = createFetchAgentPort({
    provider: 'fetch',
    startUrl: 'https://agent.example/start',
    pollUrlTemplate: 'https://agent.example/runs/{providerRunId}',
    cancelUrlTemplate: 'https://agent.example/runs/{providerRunId}/cancel',
    allowedHosts: ['agent.example'],
    requestTimeoutMs: 5_000,
    providerConfigRevision: 'fetch-demo-v1',
  }, {
    getToken: async () => 'not-logged',
    resolveInput: async () => fixtures.briefs.laptop,
    resolveProviderRunId: async () => 'provider-run-1',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body)
      return new Response(JSON.stringify({ status: 'accepted', providerRunId: 'provider-run-1' }), { status: 202, headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await port.start({
    jobId: 'job_fetch', requestId: 'req_fetch', requestVersion: 1, runId: 'run_fetch', phaseId: 'phase_fetch',
    role: 'seller_initial', merchantId: 'merchant_a', deadlineAt: Date.now() + 10_000, provider: 'fetch', inputDigest: 'sha256:brief', inputRef: 'brief_fetch',
  })
  assert.equal(result.status, 'pending')
  assert.equal(requestBody.jobId, 'job_fetch')
  assert.equal('privateMaximumCents' in requestBody.input, false)
  assert.equal(requestBody.input.runId, 'run_demo_1')
})

test('HTTP provider adapter reconciles an ambiguous start by application job ID', async () => {
  let requestedUrl = ''
  const port = createFetchAgentPort({
    provider: 'fetch',
    startUrl: 'https://agent.example/start',
    pollUrlTemplate: 'https://agent.example/runs/{providerRunId}',
    reconcileUrlTemplate: 'https://agent.example/jobs/{jobId}',
    cancelUrlTemplate: 'https://agent.example/runs/{providerRunId}/cancel',
    allowedHosts: ['agent.example'],
    requestTimeoutMs: 5_000,
    providerConfigRevision: 'fetch-demo-v2',
  }, {
    getToken: async () => undefined,
    resolveInput: async () => fixtures.briefs.laptop,
    resolveProviderRunId: async () => null,
    fetchImpl: async (url) => {
      requestedUrl = url
      return new Response(JSON.stringify({
        status: 'completed',
        providerRunId: 'provider-run-reconciled',
        model: 'fetch-seller-v1',
        output: { kind: 'abstain', jobId: 'job_reconcile', reasonCode: 'NO_MATCH' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await port.poll('job_reconcile')
  assert.equal(result.status, 'completed')
  assert.equal(requestedUrl, 'https://agent.example/jobs/job_reconcile')
  if (result.status === 'completed') assert.equal(result.providerRunId, 'provider-run-reconciled')
})

test('Fetch Agentverse routes use fixed POST envelopes and keep the token server-side', async () => {
  const requests = []
  const port = createFetchAgentPort({
    provider: 'fetch',
    startUrl: 'https://agent.example/seller/jobs',
    pollUrlTemplate: 'https://agent.example/seller/jobs/poll',
    reconcileUrlTemplate: 'https://agent.example/seller/jobs/reconcile',
    cancelUrlTemplate: 'https://agent.example/seller/jobs/cancel',
    pollMethod: 'POST',
    reconcileMethod: 'POST',
    sendTokenInBody: true,
    allowedHosts: ['agent.example'],
    requestTimeoutMs: 5_000,
    providerConfigRevision: 'fetch-agentverse-v1',
  }, {
    getToken: async () => 'shared-secret-not-logged',
    resolveInput: async () => fixtures.briefs.laptop,
    resolveProviderRunId: async () => 'fetch-seller:job_agentverse',
    fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({
        status: 'completed',
        providerRunId: 'fetch-seller:job_agentverse',
        model: 'fetch-seller-deterministic-v1',
        output: { kind: 'abstain', jobId: 'job_agentverse', reasonCode: 'NO_MATCH' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await port.poll('job_agentverse')
  assert.equal(result.status, 'completed')
  assert.equal(requests[0].url, 'https://agent.example/seller/jobs/poll')
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body.jobId, 'job_agentverse')
  assert.equal(requests[0].body.providerRunId, 'fetch-seller:job_agentverse')
  assert.equal(requests[0].body.providerAuthToken, 'shared-secret-not-logged')
})

test('HTTP provider adapter preserves an ambiguous timeout as a retryable failure without inventing a run ID', async () => {
  const port = createFetchAgentPort({
    provider: 'fetch',
    startUrl: 'https://agent.example/start',
    pollUrlTemplate: 'https://agent.example/runs/{providerRunId}',
    cancelUrlTemplate: 'https://agent.example/runs/{providerRunId}/cancel',
    allowedHosts: ['agent.example'],
    requestTimeoutMs: 5_000,
    providerConfigRevision: 'fetch-demo-v2',
  }, {
    getToken: async () => undefined,
    resolveInput: async () => fixtures.briefs.laptop,
    resolveProviderRunId: async () => null,
    fetchImpl: async () => {
      throw new Error('provider request timeout')
    },
  })
  const result = await port.start({
    jobId: 'job_timeout', requestId: 'req_timeout', requestVersion: 1, runId: 'run_timeout', phaseId: 'phase_timeout',
    role: 'seller_initial', merchantId: 'merchant_a', deadlineAt: Date.now() + 10_000, provider: 'fetch', inputDigest: 'sha256:brief', inputRef: 'brief_timeout',
  })
  assert.equal(result.status, 'failed')
  if (result.status === 'failed') {
    assert.equal(result.providerRunId, null)
    assert.equal(result.error.code, 'PROVIDER_TIMEOUT')
    assert.equal(result.error.retryable, true)
  }
})
