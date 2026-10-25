import type { Contract, OfferCard } from '../../contracts/index.ts'

type Sort = Contract<'RequestVersion'>['sort']

function compare(a: OfferCard, b: OfferCard, sort: Sort): number {
  const coverage = a.fit.coveragePercent !== null && b.fit.coveragePercent !== null
    ? b.fit.coveragePercent - a.fit.coveragePercent : 0
  const price = a.totalCents - b.totalCents
  const arrival = a.arrivalAt - b.arrivalAt
  const warranty = b.warrantyMonths - a.warrantyMonths
  const keys = {
    best_fit: [coverage, price, arrival, warranty],
    cheapest: [price, coverage, arrival, warranty],
    soonest: [arrival, coverage, price, warranty],
    warranty: [warranty, coverage, price, arrival],
  }
  return keys[sort].find((key) => key !== 0) ?? (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0)
}

// Inputs must be the current effective versions from S's assessment, after B
// applies affordability. This does not validate stock or authorize selection.
export function shortlist(offers: readonly OfferCard[], sort: Sort, now: number): OfferCard[] {
  const eligible = offers.filter((offer) => offer.selectable && offer.fit.hardRequirementsPass && offer.expiresAt > now)
  // A run has one confirmed preference set. Mixing scored and unscored offers
  // would make pairwise ordering non-transitive; require S to reassess first.
  if (new Set(eligible.map((offer) => offer.fit.coveragePercent === null)).size > 1) {
    throw new Error('INVALID_INPUT: inconsistent scoring snapshot')
  }
  if (new Set(eligible.map((offer) => offer.offer.id)).size !== eligible.length) {
    throw new Error('INVALID_INPUT: duplicate effective offer')
  }
  const sorted = eligible.sort((a, b) => compare(a, b, sort))
  const merchants = new Set<string>()
  const diverse = sorted.filter((offer) => {
    if (merchants.has(offer.merchant.id)) return false
    merchants.add(offer.merchant.id)
    return true
  })
  const selected = new Set(diverse.map((offer) => offer.offer.id))
  return [...diverse, ...sorted.filter((offer) => !selected.has(offer.offer.id))]
    .slice(0, 5).sort((a, b) => compare(a, b, sort))
}
