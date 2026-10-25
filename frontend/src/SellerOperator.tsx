import { useMemo, useState } from 'react'
import type { FinalServiceOption } from '../convex/lib/sellerContracts.ts'
import {
  type OperatorDashboardView,
  type OperatorListing,
  validateOperatorListingDraft,
} from '../convex/lib/sellerOperator.ts'
import { applyPolicyChanges } from '../convex/lib/sellerValidation.ts'
import {
  createDemoOperatorDashboard,
  formatAttributeValue,
  formatCategory,
  formatRelativeTimestamp,
  formatUsdCents,
} from './operatorDemo.ts'
import './SellerOperator.css'

type ListingFilter = 'all' | 'enabled' | 'paused'

interface ListingDraft {
  initialQuantity: number
  referenceUnitCents: number
  operatorFloorCents: number
}

interface PolicyDraft {
  maxDiscountBps: number
  shippingCents: number
  arrivalCalendarDays: number
  warrantyMonths: number
  returnDays: number
  finalServiceOptions: FinalServiceOption[]
}

function draftForListing(listing: OperatorListing): ListingDraft {
  return {
    initialQuantity: listing.initialQuantity,
    referenceUnitCents: listing.referenceUnitCents,
    operatorFloorCents: listing.operatorFloorCents,
  }
}

function draftForPolicy(view: OperatorDashboardView): PolicyDraft {
  const policy = view.policies[0]
  return {
    maxDiscountBps: policy.maxDiscountBps,
    shippingCents: policy.shippingCents,
    arrivalCalendarDays: policy.arrivalCalendarDays,
    warrantyMonths: policy.warrantyMonths,
    returnDays: policy.returnDays,
    finalServiceOptions: policy.finalServiceOptions.map((option) => ({ ...option })),
  }
}

function cloneListing(listing: OperatorListing, draft: ListingDraft): OperatorListing {
  return {
    ...listing,
    listing: { id: listing.listing.id, version: listing.listing.version + 1 },
    initialQuantity: draft.initialQuantity,
    availableQuantity: draft.initialQuantity,
    referenceUnitCents: draft.referenceUnitCents,
    operatorFloorCents: draft.operatorFloorCents,
    attributes: { ...listing.attributes },
    diagnosticAttributes: { ...listing.diagnosticAttributes },
  }
}

function newServiceOption(index: number): FinalServiceOption {
  return {
    id: `service:option-${index}`,
    shippingCents: 1_500,
    arrivalCalendarDays: 3,
    warrantyMonths: 12,
    returnDays: 14,
    incrementalCostCents: 0,
  }
}

export default function SellerOperator() {
  const [dashboard, setDashboard] = useState(createDemoOperatorDashboard)
  const [selectedId, setSelectedId] = useState(dashboard.listings[0]?.listing.id ?? '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [listingDraft, setListingDraft] = useState<ListingDraft>(() => draftForListing(dashboard.listings[0]))
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(() => draftForPolicy(dashboard))
  const [editingPolicy, setEditingPolicy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = dashboard.listings.find((listing) => listing.listing.id === selectedId) ?? dashboard.listings[0]
  const policy = dashboard.policies[0]
  const filteredListings = useMemo(() => dashboard.listings.filter((listing) => {
    const matchesSearch = `${listing.title} ${listing.variantId} ${listing.category}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'enabled' ? listing.enabled : !listing.enabled)
    return matchesSearch && matchesFilter
  }), [dashboard.listings, filter, search])
  const enabledCount = dashboard.listings.filter((listing) => listing.enabled).length
  const configuredUnits = dashboard.listings.reduce((total, listing) => total + listing.initialQuantity, 0)
  const availableUnits = dashboard.listings.reduce((total, listing) => total + listing.availableQuantity, 0)

  function selectListing(listing: OperatorListing) {
    setSelectedId(listing.listing.id)
    setListingDraft(draftForListing(listing))
    setError('')
    setNotice('')
  }

  function saveListing() {
    if (!selected) return
    const errors = validateOperatorListingDraft(listingDraft)
    if (errors.length > 0) {
      setError(errors.map((entry) => entry.message).join(' '))
      setNotice('')
      return
    }
    setDashboard((current) => ({
      ...current,
      listings: current.listings.map((listing) => listing.listing.id === selected.listing.id
        ? cloneListing(listing, listingDraft)
        : listing),
      recentEvents: [{
        eventType: 'listing_published',
        jobId: null,
        candidateId: null,
        offerId: null,
        safeReasons: [],
        createdAt: Date.parse('2026-10-24T12:00:00.000Z'),
      }, ...current.recentEvents],
    }))
    setNotice(`Saved a new listing version for ${selected.title}.`)
    setError('')
  }

  function toggleListing() {
    if (!selected) return
    setDashboard((current) => ({
      ...current,
      listings: current.listings.map((listing) => listing.listing.id === selected.listing.id
        ? { ...listing, enabled: !listing.enabled, listing: { ...listing.listing, version: listing.listing.version + 1 } }
        : listing),
    }))
    setNotice(`${selected.title} is now ${selected.enabled ? 'paused' : 'active'} for new seller jobs.`)
    setError('')
  }

  function savePolicy() {
    try {
      const nextPolicy = applyPolicyChanges(policy, policyDraft, policy.policy.version + 1)
      setDashboard((current) => ({
        ...current,
        policies: [nextPolicy],
        merchant: { ...current.merchant, currentPolicy: { ...nextPolicy.policy } },
        recentEvents: [{
          eventType: 'policy_published',
          jobId: null,
          candidateId: null,
          offerId: null,
          safeReasons: [],
          createdAt: Date.parse('2026-10-24T12:00:00.000Z'),
        }, ...current.recentEvents],
      }))
      setEditingPolicy(false)
      setNotice(`Policy v${nextPolicy.policy.version} is ready for seller validation.`)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Policy could not be published.')
      setNotice('')
    }
  }

  function toggleParticipation() {
    setDashboard((current) => ({
      ...current,
      merchant: { ...current.merchant, paused: !current.merchant.paused },
      recentEvents: [{
        eventType: current.merchant.paused ? 'merchant_resumed' : 'merchant_paused',
        jobId: null,
        candidateId: null,
        offerId: null,
        safeReasons: [],
        createdAt: Date.parse('2026-10-24T12:00:00.000Z'),
      }, ...current.recentEvents],
    }))
    setNotice(dashboard.merchant.paused ? 'New seller participation is enabled.' : 'New seller participation is paused.')
    setError('')
  }

  return (
    <div className="operator-app">
      <header className="operator-header">
        <div>
          <p className="eyebrow">BUYERUNION / SELLER OPS</p>
          <h1>Merchant control plane</h1>
          <p className="lede">Keep your catalog accurate, your pricing guardrails explicit, and your seller agent ready for the next qualified request.</p>
        </div>
        <div className="header-actions">
          <span className="mode-pill"><span className="status-dot" /> Fixture preview</span>
          <button className="secondary-button" type="button" onClick={toggleParticipation}>
            {dashboard.merchant.paused ? 'Resume participation' : 'Pause participation'}
          </button>
        </div>
      </header>

      <div className="security-note">
        <span className="shield-mark">⌁</span>
        <span><strong>Seller-owned and server-validated.</strong> Changes create immutable versions. Hidden costs stay inside the authenticated merchant boundary; buyer ceilings and private buyer data never appear here.</span>
      </div>

      {(error || notice) && <div className={`operator-message ${error ? 'is-error' : 'is-success'}`} role="status">{error || notice}</div>}

      <section className="metric-grid" aria-label="Merchant summary">
        <article className="metric-card metric-card--accent"><span>Active listings</span><strong>{enabledCount}</strong><small>of {dashboard.listings.length} configured</small></article>
        <article className="metric-card"><span>Available units</span><strong>{availableUnits}</strong><small>{configuredUnits} configured across catalog</small></article>
        <article className="metric-card"><span>Accepted offers</span><strong>{dashboard.analytics.acceptedOfferEventCount}</strong><small>{dashboard.analytics.observedEventCount} recorded events</small></article>
        <article className="metric-card"><span>Policy version</span><strong>v{policy.policy.version}</strong><small>{policy.enabled ? 'validation enabled' : 'participation disabled'}</small></article>
      </section>

      <main className="operator-grid">
        <section className="panel catalog-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">Catalog</p><h2>What your agent can sell</h2></div>
            <span className="count-badge">{filteredListings.length} shown</span>
          </div>
          <div className="catalog-toolbar">
            <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search catalog" placeholder="Search title or SKU" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="segmented-control" role="group" aria-label="Catalog filter">
              {(['all', 'enabled', 'paused'] as const).map((option) => <button key={option} className={filter === option ? 'is-selected' : ''} type="button" onClick={() => setFilter(option)}>{option}</button>)}
            </div>
          </div>
          <div className="listing-list">
            {filteredListings.map((listing) => (
              <button key={`${listing.listing.id}:${listing.listing.version}`} className={`listing-row ${selected?.listing.id === listing.listing.id ? 'is-selected' : ''}`} type="button" onClick={() => selectListing(listing)}>
                <span className="listing-thumb">{listing.title.slice(0, 1)}</span>
                <span className="listing-copy"><strong>{listing.title}</strong><small>{listing.variantId} · {formatCategory(listing.category)} · v{listing.listing.version}</small></span>
                <span className="listing-stock"><strong>{listing.availableQuantity}</strong><small>available</small></span>
                <span className="listing-price"><strong>{formatUsdCents(listing.referenceUnitCents)}</strong><small>MSRP</small></span>
                <span className={`status-label ${listing.enabled ? 'is-live' : 'is-paused'}`}>{listing.enabled ? 'Active' : 'Paused'}</span>
              </button>
            ))}
          </div>
          <p className="panel-footnote">Catalog facts are synthetic demo data. A future import flow will validate provenance before publishing a listing version.</p>
        </section>

        <aside className="side-column">
          {selected && <section className="panel editor-panel">
            <div className="panel-heading"><div><p className="section-kicker">Listing editor</p><h2>{selected.title}</h2></div><span className="version-chip">v{selected.listing.version}</span></div>
            <p className="muted">{selected.syntheticProduct ? 'Synthetic demo product' : 'Merchant product'} · {selected.condition}</p>
            <div className="fact-strip"><span><small>Variant</small><strong>{selected.variantId}</strong></span><span><small>Stock</small><strong>{selected.availableQuantity}/{selected.initialQuantity}</strong></span></div>
            <div className="field-grid">
              <label>Configured quantity<input type="number" min="0" max="10000" step="1" value={listingDraft.initialQuantity} onChange={(event) => setListingDraft({ ...listingDraft, initialQuantity: Number(event.target.value) })} /></label>
              <label>MSRP / reference<input type="number" min="1" step="0.01" value={(listingDraft.referenceUnitCents / 100).toFixed(2)} onChange={(event) => setListingDraft({ ...listingDraft, referenceUnitCents: Math.round(Number(event.target.value) * 100) })} /></label>
              <label>Lowest accepted<input type="number" min="0" step="0.01" value={(listingDraft.operatorFloorCents / 100).toFixed(2)} onChange={(event) => setListingDraft({ ...listingDraft, operatorFloorCents: Math.round(Number(event.target.value) * 100) })} /></label>
            </div>
            <div className="editor-actions"><button className="primary-button" type="button" onClick={saveListing}>Save new version</button><button className="text-button" type="button" onClick={toggleListing}>{selected.enabled ? 'Pause listing' : 'Activate listing'}</button></div>
            <div className="attribute-list"><p className="section-kicker">Published facts</p>{Object.entries(selected.attributes).slice(0, 4).map(([key, attribute]) => <span key={key}><small>{key}</small><strong>{formatAttributeValue(attribute.value)}{attribute.unit ? ` ${attribute.unit}` : ''}</strong></span>)}</div>
          </section>}

          <section className="panel policy-panel">
            <div className="panel-heading"><div><p className="section-kicker">Pricing policy</p><h2>Guardrails</h2></div><span className="version-chip">v{policy.policy.version}</span></div>
            {!editingPolicy ? <>
              <div className="policy-summary"><span><small>Max discount</small><strong>{(policy.maxDiscountBps / 100).toFixed(1)}%</strong></span><span><small>Shipping</small><strong>{formatUsdCents(policy.shippingCents)}</strong></span><span><small>Terms</small><strong>{policy.arrivalCalendarDays}d · {policy.warrantyMonths}mo</strong></span></div>
              <div className="service-options"><div className="service-heading"><span><p className="section-kicker">Final service options</p><small>Only explicitly authorized upgrades may be offered.</small></span><span className="lock-chip">⌁ private cost</span></div>{policy.finalServiceOptions.length === 0 ? <p className="empty-state">Baseline service only. No upgrades are currently authorized.</p> : policy.finalServiceOptions.map((option) => <div className="service-option" key={option.id}><strong>{option.id}</strong><small>{formatUsdCents(option.shippingCents)} shipping · {option.arrivalCalendarDays} day arrival · {option.warrantyMonths} month warranty</small></div>)}</div>
              <button className="secondary-button full-button" type="button" onClick={() => { setPolicyDraft(draftForPolicy(dashboard)); setEditingPolicy(true); setError(''); setNotice('') }}>Edit policy</button>
            </> : <div className="policy-form">
              <div className="field-grid"><label>Max discount %<input type="number" min="0" max="100" step="0.1" value={(policyDraft.maxDiscountBps / 100).toFixed(1)} onChange={(event) => setPolicyDraft({ ...policyDraft, maxDiscountBps: Math.round(Number(event.target.value) * 100) })} /></label><label>Shipping<input type="number" min="0" step="0.01" value={(policyDraft.shippingCents / 100).toFixed(2)} onChange={(event) => setPolicyDraft({ ...policyDraft, shippingCents: Math.round(Number(event.target.value) * 100) })} /></label><label>Arrival days<input type="number" min="0" max="365" step="1" value={policyDraft.arrivalCalendarDays} onChange={(event) => setPolicyDraft({ ...policyDraft, arrivalCalendarDays: Number(event.target.value) })} /></label><label>Warranty months<input type="number" min="0" max="120" step="1" value={policyDraft.warrantyMonths} onChange={(event) => setPolicyDraft({ ...policyDraft, warrantyMonths: Number(event.target.value) })} /></label><label>Return days<input type="number" min="0" max="365" step="1" value={policyDraft.returnDays} onChange={(event) => setPolicyDraft({ ...policyDraft, returnDays: Number(event.target.value) })} /></label></div>
              <div className="service-editor"><div className="service-heading"><span><p className="section-kicker">Authorized service options</p><small>Private incremental costs never leave the seller boundary.</small></span><button className="text-button" type="button" onClick={() => setPolicyDraft({ ...policyDraft, finalServiceOptions: [...policyDraft.finalServiceOptions, newServiceOption(policyDraft.finalServiceOptions.length + 1)] })}>+ Add option</button></div>{policyDraft.finalServiceOptions.map((option, index) => <div className="service-option-form" key={`${option.id}-${index}`}><input aria-label={`Service option ${index + 1} ID`} value={option.id} onChange={(event) => setPolicyDraft({ ...policyDraft, finalServiceOptions: policyDraft.finalServiceOptions.map((current, currentIndex) => currentIndex === index ? { ...current, id: event.target.value } : current) })} /><input aria-label="Option shipping" type="number" min="0" step="0.01" value={(option.shippingCents / 100).toFixed(2)} onChange={(event) => setPolicyDraft({ ...policyDraft, finalServiceOptions: policyDraft.finalServiceOptions.map((current, currentIndex) => currentIndex === index ? { ...current, shippingCents: Math.round(Number(event.target.value) * 100) } : current) })} /><button className="icon-button" type="button" aria-label={`Remove ${option.id}`} onClick={() => setPolicyDraft({ ...policyDraft, finalServiceOptions: policyDraft.finalServiceOptions.filter((_, currentIndex) => currentIndex !== index) })}>×</button></div>)}</div>
              <div className="editor-actions"><button className="primary-button" type="button" onClick={savePolicy}>Publish policy version</button><button className="text-button" type="button" onClick={() => setEditingPolicy(false)}>Cancel</button></div>
            </div>}
          </section>
        </aside>
      </main>

      <section className="bottom-grid">
        <section className="panel activity-panel"><div className="panel-heading"><div><p className="section-kicker">Activity</p><h2>What changed</h2></div><span className="count-badge">{dashboard.recentEvents.length} recent</span></div><div className="activity-list">{dashboard.recentEvents.slice(0, 5).map((event, index) => <div className="activity-row" key={`${event.eventType}-${event.createdAt}-${index}`}><span className={`activity-icon ${event.eventType.includes('rejected') ? 'is-warning' : ''}`}>{event.eventType.includes('rejected') ? '!' : '✓'}</span><span><strong>{event.eventType.replaceAll('_', ' ')}</strong><small>{event.safeReasons[0]?.message ?? (event.offerId ? `Offer ${event.offerId}` : 'Server-recorded merchant change')}</small></span><time>{formatRelativeTimestamp(event.createdAt)}</time></div>)}</div></section>
        <section className="panel readiness-panel"><p className="section-kicker">Agent readiness</p><h2>Ready for qualified demand</h2><p className="muted">Your seller agent receives only the confirmed public brief and this merchant’s own catalog. The server recomputes fit, stock, floors, contribution and terms before an offer is accepted.</p><div className="readiness-checks"><span>✓ Catalog facts present</span><span>✓ Policy guardrails active</span><span>✓ Provider mode: fixture</span></div><button className="secondary-button full-button" type="button" onClick={() => setNotice('Live Fetch configuration is intentionally outside this fixture preview.')}>Review agent handoff</button></section>
      </section>

      <footer className="operator-footer"><span>BuyerUnion seller workspace</span><span>Fixture preview · Convex/Auth connection pending</span></footer>
    </div>
  )
}
