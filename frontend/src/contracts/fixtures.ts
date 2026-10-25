import { contracts } from './index.ts'

// Fixed timestamps and fictional commerce, never claimed as live provider data.
export const fixtureNow = 1792861200000
export const laptopLine = contracts.RequestLine.parse({
  lineId: 'line-laptop', role: 'primary', category: 'laptop', profile: { id: 'laptop', version: 1 },
  quantity: 1, allowedConditions: ['new'], useCaseSummary: 'A new laptop with 16 GB RAM',
  requirements: [{ id: 'ram', fieldId: 'ramGb', operator: 'min', value: 16, unit: 'GB', strength: 'hard', weight: 1 }],
})
export const clothingLine = contracts.RequestLine.parse({
  lineId: 'line-shirt', role: 'primary', category: 'clothing', profile: { id: 'clothing', version: 1 },
  quantity: 1, allowedConditions: ['new'], useCaseSummary: 'A navy DemoWear shirt',
  requirements: [{ id: 'color', fieldId: 'color', operator: 'equals', value: 'navy', unit: null, strength: 'hard', weight: 1 }],
})
export const confirmedRequest = contracts.RequestVersion.parse({
  schemaVersion: 1, request: { id: 'request-demo', version: 1 }, ownerId: 'buyer-demo', createdAt: fixtureNow,
  rawMessages: [{ id: 'message-demo', text: 'A new laptop with 16 GB RAM, my private maximum is $1,000.' }],
  origins: [], privateMaximumCents: 100000, confirmedAt: fixtureNow, sort: 'best_fit',
  brief: {
    schemaVersion: 1, request: { id: 'request-demo', version: 1 }, currency: 'USD',
    deliveryRegion: 'US-CA-SAN_FRANCISCO', deliveryDeadline: fixtureNow + 5 * 86400000,
    lines: [laptopLine], sharedTarget: null,
  },
})
export const laptopCard = contracts.OfferCard.parse({
  offer: { id: 'offer-b', version: 1 }, merchant: { id: 'merchant-b', displayName: 'Demo Merchant B', demo: true },
  products: [{ requestLineId: laptopLine.lineId, variantId: 'P3', title: 'MacBook Air M4 16 GB / 512 GB', condition: 'new', quantity: 1 }],
  totalCents: 97000, initialTotalCents: 100000, currency: 'USD', arrivalAt: fixtureNow + 86400000,
  warrantyMonths: 24, returnDays: 30,
  fit: { checks: [{ requirementId: 'ram', status: 'matched', actual: 16, sourceIds: [], explanation: 'Synthetic fixture specification.' }],
    coveragePercent: null, hardRequirementsPass: true, scoringVersion: 1 },
  fitArgument: 'Meets the confirmed RAM requirement.', mainConcern: 'Owner evidence unavailable.',
  evidenceStatus: 'unavailable', evidenceIds: [], expiresAt: fixtureNow + 900000,
  selectable: true, unavailableReason: null,
})
export const clothingCard = contracts.OfferCard.parse({
  ...laptopCard, offer: { id: 'offer-shirt', version: 1 },
  products: [{ requestLineId: clothingLine.lineId, variantId: 'C1', title: 'DemoWear navy tee', condition: 'new', quantity: 1 }],
  totalCents: 2500, initialTotalCents: 2500,
  fit: { checks: [{ requirementId: 'color', status: 'matched', actual: 'navy', sourceIds: [], explanation: 'Synthetic demo attribute.' }],
    coveragePercent: null, hardRequirementsPass: true, scoringVersion: 1 },
  fitArgument: 'Matches the confirmed color.', mainConcern: 'Fictional product; no real owner evidence.',
})
