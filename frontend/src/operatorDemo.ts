import { makeSellerFixtures } from '../convex/lib/sellerFixtures.ts'
import { projectOperatorListing, type OperatorDashboardView, type OperatorListing } from '../convex/lib/sellerOperator.ts'

const fixtures = makeSellerFixtures()
const demoMerchantId = 'merchant_a'

export function createDemoOperatorDashboard(): OperatorDashboardView {
  const policy = fixtures.policiesByMerchant[demoMerchantId]
  const listings = fixtures.snapshotsByMerchant[demoMerchantId].map((snapshot) => (
    projectOperatorListing(snapshot.listing, snapshot.variant, snapshot.availableQuantity)
  ))

  return {
    merchant: {
      merchantId: demoMerchantId,
      displayName: 'Demo Merchant A',
      enabled: true,
      paused: false,
      currentPolicy: { ...policy.policy },
    },
    listings,
    policies: [{
      ...policy,
      policy: { ...policy.policy },
      unitCostByListing: { ...policy.unitCostByListing },
      minimumContributionByListing: { ...policy.minimumContributionByListing },
      finalServiceOptions: policy.finalServiceOptions.map((option) => ({ ...option })),
    }],
    recentOffers: [
      {
        offer: { id: 'offer_demo_merchant_a_candidate_1', version: 1 },
        jobId: 'job_demo_1',
        candidateId: 'merchant_a:candidate:1',
        status: 'accepted',
        totalCents: 99_000,
        mode: 'fixture',
        createdAt: Date.parse('2026-10-24T11:48:00.000Z'),
      },
      {
        offer: { id: 'offer_demo_merchant_a_candidate_2', version: 1 },
        jobId: 'job_demo_2',
        candidateId: 'merchant_a:candidate:2',
        status: 'hold',
        totalCents: 62_000,
        mode: 'fixture',
        createdAt: Date.parse('2026-10-24T11:42:00.000Z'),
      },
    ],
    analytics: {
      reportingPeriod: {
        from: Date.parse('2026-10-24T09:00:00.000Z'),
        to: Date.parse('2026-10-24T12:00:00.000Z'),
      },
      observedEventCount: 18,
      proposalEventCount: 9,
      rejectedProposalEventCount: 2,
      acceptedOfferEventCount: 7,
    },
    recentEvents: [
      {
        eventType: 'offer_accepted',
        jobId: 'job_demo_1',
        candidateId: 'merchant_a:candidate:1',
        offerId: 'offer_demo_merchant_a_candidate_1',
        safeReasons: [],
        createdAt: Date.parse('2026-10-24T11:48:00.000Z'),
      },
      {
        eventType: 'proposal_rejected',
        jobId: 'job_demo_3',
        candidateId: 'merchant_a:candidate:2',
        offerId: null,
        safeReasons: [{ code: 'PRICE_BELOW_FLOOR', field: 'lines.line_main.unitCents', message: 'Proposed price was below the server floor.' }],
        createdAt: Date.parse('2026-10-24T11:31:00.000Z'),
      },
      {
        eventType: 'policy_published',
        jobId: null,
        candidateId: null,
        offerId: null,
        safeReasons: [],
        createdAt: Date.parse('2026-10-24T10:15:00.000Z'),
      },
    ],
  }
}

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function formatCategory(category: OperatorListing['category']): string {
  return category.replaceAll('_', ' ')
}

export function formatAttributeValue(value: OperatorListing['attributes'][string]['value']): string {
  if (value === null) return 'Unknown'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export function formatRelativeTimestamp(timestamp: number, now = Date.parse('2026-10-24T12:00:00.000Z')): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hr ago`
}
