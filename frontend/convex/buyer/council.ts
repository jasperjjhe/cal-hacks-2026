import { contracts, type Contract } from '../../src/contracts/index.ts';
import { canonical, dateOnly, fail, type ReadCtx } from './core.ts';
import { assessLine } from '../lib/sellerValidation.ts';
import { loadSnapshots, getPolicy } from '../sellerInternal.ts';
import { merchantEligible } from './eligibility.ts';
import type { Doc } from '../_generated/dataModel';

export const councilPhases = ['brief', 'advocacy', 'reply', 'adjudication'] as const;
export type CouncilInput = Contract<'CouncilJobInput'>;
export type PublicOffer = Contract<'PublicCompetitionOffer'>;
export const sameRef = (a: Contract<'Ref'>, b: Contract<'Ref'>) => a.id === b.id && a.version === b.version;
export const envelope = (input: CouncilInput) => contracts.CouncilEnvelope.parse({
  schemaVersion: 2, jobId: input.jobId, councilId: input.councilId, request: input.request,
  runId: input.runId, snapshot: input.snapshot, snapshotDigest: input.snapshotDigest,
  phase: input.phase, deadlineAt: input.deadlineAt,
});

// Reuse S's assessment; changing private affordability never changes participation.
export async function publiclyEligible(ctx: ReadCtx, row: Doc<'buyerOffers'>, request: Contract<'RequestVersion'>) {
  if (!row.data.policyValid || !row.data.requirementsValidExceptBudget || row.data.expiresAt <= Date.now() ||
      !(await merchantEligible(ctx, row.merchantId, row.data.policy))) return false;
  if (!(await getPolicy(ctx, row.data.policy)).enabled) return false;
  const snapshots = await loadSnapshots(ctx, row.merchantId);
  return request.brief.lines.every(line => {
    const quoted = (row.data.lines as Contract<'OfferVersion'>['lines']).find(q => q.requestLineId === line.lineId);
    const saved = (row.card.products as Contract<'OfferCard'>['products']).find(p => p.requestLineId === line.lineId);
    const current = snapshots.find(s => s.listing.listing.id === quoted?.listing.id);
    return !!quoted && !!current && current.listing.listing.version === quoted.listing.version &&
      current.variant.id === saved?.variantId && current.listing.condition === saved.condition &&
      assessLine(line, current).hardRequirementsPassed;
  });
}

export async function publicOffer(ctx: ReadCtx, row: Doc<'buyerOffers'>, request: Contract<'RequestVersion'>) {
  const data = contracts.OfferVersion.parse(row.data);
  const snapshots = await loadSnapshots(ctx, row.merchantId);
  const lines: PublicOffer['lines'] = [];
  for (const quoted of data.lines) {
    const requested = request.brief.lines.find(l => l.lineId === quoted.requestLineId)!;
    const product = snapshots.find(s => s.listing.listing.id === quoted.listing.id)!;
    const profile = await ctx.db.query('categoryProfiles').withIndex('by_profileId_and_version', q =>
      q.eq('profileId', requested.profile.id).eq('version', requested.profile.version)).unique();
    const configuration = Object.fromEntries((profile?.fields ?? []).map(field => [field.id,
      (product.listing.diagnosticAttributes[field.id] ?? product.variant.attributes[field.id])?.value ?? null,
    ]));
    lines.push({ requestLineId: quoted.requestLineId, listing: quoted.listing, variantId: product.variant.id,
      condition: product.listing.condition, quantity: quoted.quantity, configuration });
  }
  return contracts.PublicCompetitionOffer.parse({
    merchantId: data.merchantId, candidateId: data.candidateId, offer: data.offer, lines,
    totalCents: data.totalCents, shippingCents: data.shippingCents, arrivalAt: data.arrivalAt,
    warrantyMonths: data.warrantyMonths, returnDays: data.returnDays,
    checks: data.fit.checks.map(c => ({ ...c, explanation: 'Recorded deterministic requirement check.' })),
    // Free-form seller assertions are internal until checked, never broadcast verbatim.
    claims: data.claims.map(c => ({ id: c.id, requestLineId: c.requestLineId,
      text: 'Unverified seller claim; only referenced facts establish support.', sourceIds: c.sourceIds })),
  });
}

export function factsFor(offers: PublicOffer[]): Contract<'CouncilFact'>[] {
  const facts: Contract<'CouncilFact'>[] = [];
  offers.forEach((offer, index) => {
    for (const [fieldId, dimension, unit] of [
      ['totalCents', 'price', 'USD_cents'], ['shippingCents', 'price', 'USD_cents'],
      ['arrivalAt', 'delivery', 'UTC_ms'], ['warrantyMonths', 'warranty', 'months'], ['returnDays', 'returns', 'days'],
    ] as const) facts.push({ id: `f:${index}:${fieldId}`, offer: offer.offer, dimension,
      fieldId, value: offer[fieldId], unit, requirementId: null, status: null, provenance: 'validated_terms', sourceIds: [] });
    offer.checks.forEach((check, i) => facts.push({ id: `f:${index}:requirement:${i}`, offer: offer.offer,
      dimension: 'fit', fieldId: check.requirementId, value: check.actual, unit: null,
      requirementId: check.requirementId, status: check.status, provenance: 'validated_requirement', sourceIds: check.sourceIds }));
  });
  return facts;
}

export function comparison(input: CouncilInput, point: Contract<'ComparativePoint'>, merchantId: string) {
  const own = input.competition.offers.find(o => sameRef(o.offer, point.ownOffer) && o.merchantId === merchantId);
  const rival = input.competition.offers.find(o => sameRef(o.offer, point.rivalOffer) && o.merchantId !== merchantId);
  if (!own || !rival || !point.factIds.length || point.factIds.some(id => !input.facts.some(f =>
    f.id === id && f.dimension === point.dimension && (sameRef(f.offer, own.offer) || sameRef(f.offer, rival.offer)))))
    fail('INVALID_INPUT', 'Comparative references are outside the frozen snapshot.');
  sourceRefs(input, point.sourceIds);
  const label = (o: PublicOffer) => `${o.merchantId}/${o.candidateId}`;
  const values = (o: PublicOffer) => ({
    price: `$${(o.totalCents / 100).toFixed(2)} delivered`,
    delivery: `arrival ${dateOnly(o.arrivalAt)}`,
    warranty: `${o.warrantyMonths} months warranty`, returns: `${o.returnDays} days returns`,
    fit: `${o.checks.filter(c => c.status === 'matched').length}/${o.checks.length} recorded requirements matched`,
  })[point.dimension];
  const goods = (o: PublicOffer) => o.lines.map(l => [l.requestLineId, l.variantId, l.condition, l.quantity, l.configuration]);
  const different = canonical(goods(own)) !== canonical(goods(rival));
  return { ...point, summary: `${label(own)}: ${values(own)}; ${label(rival)}: ${values(rival)}.${different ? ' Products/configurations differ; this is not an equivalent saving.' : ''}` };
}
export function sourceRefs(input: CouncilInput, ids: string[]) {
  if (ids.some(id => !input.competition.approvedSourceIds.includes(id))) fail('INVALID_INPUT', 'Unapproved council source.');
}
export function factRefs(input: CouncilInput, ids: string[], offers?: Contract<'Ref'>[]) {
  if (ids.some(id => !input.facts.some(f => f.id === id && (!offers || offers.some(o => sameRef(o, f.offer))))))
    fail('INVALID_INPUT', 'Unapproved council fact.');
}
export function checkEnvelope(input: CouncilInput, output: unknown) {
  const parsed = contracts.CouncilEnvelope.safeParse(Object.fromEntries(
    Object.keys(envelope(input)).map(k => [k, (output as Record<string, unknown>)?.[k]])));
  if (!parsed.success || canonical(parsed.data) !== canonical(envelope(input))) fail('STALE_VERSION', 'Council output binding mismatch.');
}
export function fixtureCouncil(input: CouncilInput) {
  const base = envelope(input);
  if (input.role === 'moderator_brief') return { ...base, phase: 'brief', participants:
    [...new Set(input.competition.offers.map(o => o.merchantId))].map(merchantId => {
      const own = input.competition.offers.find(o => o.merchantId === merchantId)!;
      const rival = input.competition.offers.find(o => o.merchantId !== merchantId)!;
      return { merchantId, points: (['price', 'delivery', 'warranty', 'returns', 'fit'] as const).map(dimension => ({
        ownOffer: own.offer, rivalOffer: rival.offer, dimension,
        factIds: input.facts.filter(f => f.dimension === dimension && (sameRef(f.offer, own.offer) || sameRef(f.offer, rival.offer))).map(f => f.id).slice(0, 40),
        sourceIds: [], summary: '',
      })).filter(p => p.factIds.length) };
    }) };
  if (input.role === 'seller_advocacy') {
    const target = input.competition.offers.find(o => o.merchantId !== input.merchantId)!;
    const fact = input.facts.find(f => sameRef(f.offer, target.offer) && f.dimension === 'fit');
    return { ...base, phase: 'advocacy', defenses: input.ownOffers.map(ownOffer => ({ ownOffer, text: '',
      factIds: input.facts.filter(f => sameRef(f.offer, ownOffer)).map(f => f.id).slice(0, 40), sourceIds: [] })),
      challenge: fact ? { targetOffer: target.offer, claimId: null, factId: fact.id, question: 'Please confirm this recorded requirement fact.', sourceIds: [] } : null };
  }
  if (input.role === 'seller_reply') return { ...base, phase: 'reply', answers: input.challenges.map(c => ({
    challengeId: c.id, disposition: 'defend', text: '', factIds: c.challenge.factId ? [c.challenge.factId] : [], sourceIds: [],
  })) };
  return { ...base, phase: 'adjudication', outcomes: input.challenges.map(c => ({ challengeId: c.id,
    finding: 'unknown', factIds: c.challenge.factId ? [c.challenge.factId] : [], sourceIds: [], summary: '',
  })) };
}
