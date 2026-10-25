import { buyerTiming } from '../convex/buyer/timing.ts';
import assert from 'node:assert/strict';
import { contracts } from '../src/contracts/index.ts';
import { confirmedRequest, laptopCard } from '../src/contracts/fixtures.ts';
import { factsFor, comparison, envelope } from '../convex/buyer/council.ts';
import { invokeCreao, pollCreao, cancelCreao, snapshotCreaoConfig } from '../convex/integrations/creaoBuyer.ts';

const roles = ['intake', 'moderator_brief', 'moderator_adjudication', 'evidence_summary'];
export function smokeInputs(now = Date.now()) {
  const offers = ['merchant-a', 'merchant-b'].map((merchantId, i) => ({ merchantId, candidateId: `demo-candidate-${i}`,
    offer: { id: `demo-offer-${i}`, version: 1 }, lines: [{ requestLineId: 'line-laptop', listing: { id: `demo-listing-${i}`, version: 1 },
      variantId: 'demo-product', condition: 'new', quantity: 1, configuration: { ramGb: 16 } }],
    totalCents: 97000 + i * 1000, shippingCents: 0, arrivalAt: now + 86400000,
    warrantyMonths: 12, returnDays: 30, checks: laptopCard.fit.checks, claims: [],
  }));
  const facts = factsFor(offers);
  const competition = contracts.CompetitionSnapshot.parse({ schemaVersion: 2, snapshot: { id: 'demo-snapshot', version: 1 },
    councilId: 'demo-council', request: confirmedRequest.request, runId: 'demo-run', createdAt: now,
    brief: { ...confirmedRequest.brief, deliveryDeadline: now + 7 * 86400000 }, offers, approvedFactIds: facts.map(f => f.id), approvedSourceIds: [] });
  function input(role, phase) {
    return contracts.CouncilJobInput.parse({ schemaVersion: 2, jobId: `smoke-${role}-${now}`, councilId: competition.councilId,
      request: competition.request, runId: competition.runId, snapshot: competition.snapshot, snapshotDigest: 'demo-digest',
      phase, deadlineAt: now + buyerTiming.creaoMs, role, merchantId: null, competition, facts, ownOffers: [], comparisons: [],
      challenges: [], defenses: [], replies: [] });
  }
  const brief = input('moderator_brief', 'brief');
  const adjudication = input('moderator_adjudication', 'adjudication');
  adjudication.challenges = [{ id: 'demo-challenge', authorMerchantId: 'merchant-a', targetMerchantId: 'merchant-b',
    challenge: { targetOffer: offers[1].offer, claimId: null, factId: facts.find(f => f.offer.id === offers[1].offer.id && f.dimension === 'fit').id,
      question: 'Please verify the recorded RAM requirement.', sourceIds: [] } }];
  return {
    intake: { draft: contracts.DraftView.parse({ requestId: 'demo-request', draftVersion: 1,
      messages: [{ id: 'demo-message', role: 'buyer', text: 'I want a new laptop with 16 GB RAM. Around $1,000. Please clarify delivery.', createdAt: now }],
      interpretation: null, confirmedRequest: null, updatedAt: now }),
      profiles: [contracts.CategoryProfile.parse({ profile: { id: 'laptop', version: 1 }, category: 'laptop', allowedConditions: ['new'],
        fields: [{ id: 'ramGb', label: 'RAM', kind: 'number', unit: 'GB', allowedOperators: ['min', 'equals'], allowedValues: null, minimum: 1, maximum: 1024 }],
        variantKeyFields: ['ramGb'], compatibilityRuleId: null, evidenceRuleId: 'demo-evidence' })] },
    moderator_brief: brief, moderator_adjudication: adjudication,
    evidence_summary: { variantId: 'demo-product', evidence: [] },
  };
}
export function checkSmokeResult(role, input, output) {
  if (role === 'moderator_brief') {
    assert.deepEqual(contracts.CouncilEnvelope.parse(Object.fromEntries(Object.keys(envelope(input)).map(k => [k, output[k]]))), envelope(input));
    const expected = [...new Set(input.competition.offers.map(o => o.merchantId))].sort();
    assert.deepEqual(output.participants.map(p => p.merchantId).sort(), expected);
    for (const p of output.participants) for (const point of p.points) comparison(input, point, p.merchantId);
  } else if (role === 'moderator_adjudication') {
    assert.deepEqual(contracts.CouncilEnvelope.parse(Object.fromEntries(Object.keys(envelope(input)).map(k => [k, output[k]]))), envelope(input));
    assert.deepEqual(output.outcomes.map(o => o.challengeId).sort(), input.challenges.map(c => c.id).sort());
    // No reply was supplied; it is not an admission.
    assert.ok(output.outcomes.every(o => o.finding === 'unknown'));
  } else if (role === 'intake') {
    assert.equal(output.expectedDraftVersion, 1);
    assert.ok(output.origins.every(o => !o.buyerConfirmed));
    assert.equal(output.proposedDeadline, null);
    assert.equal(output.proposedSharedTargetCents, null);
    assert.ok(output.clarificationQuestions.length > 0);
  } else {
    assert.equal(output.variantId, input.variantId);
    assert.equal(output.positives.length + output.concerns.length, 0);
    assert.ok(output.gaps.length > 0);
  }
}
async function main() {
  const ready = roles.every(role => snapshotCreaoConfig(role)) && !!process.env.CREAO_API_KEY &&
    process.env.CREAO_BUYER_CONFIG_REVISION === 'council-v2' && !/gemini/i.test(process.env.CREAO_BUYER_MODEL_ID ?? '');
  if (!ready) {
    console.error('Not configured. Set CREAO_API_KEY, CREAO_INTAKE_AGENT_ID, CREAO_COUNCIL_AGENT_ID and CREAO_BUYER_CONFIG_REVISION=council-v2. CREAO_BUYER_MODEL_ID is optional. No calls made.');
    process.exitCode = 1; return;
  }
  if (!process.argv.includes('--live')) {
    console.log('Buyer agent configuration present. Use --live to make four potentially billable isolated role calls.'); return;
  }
  for (const role of roles) {
    const now = Date.now();
    const input = smokeInputs(now)[role];
    const job = { id: role === 'moderator_brief' || role === 'moderator_adjudication' ? input.jobId : `smoke-${role}-${now}`,
      role, input, providerRunId: null, deadlineAt: now + buyerTiming.creaoMs,
      config: snapshotCreaoConfig(role) };
    let result = await invokeCreao(job);
    while (result.status === 'pending' && Date.now() + 1000 < job.deadlineAt) {
      await new Promise(resolve => setTimeout(resolve, Math.min(buyerTiming.pollMs, job.deadlineAt - Date.now() - 1000)));
      job.providerRunId = result.providerRunId;
      result = await pollCreao(job);
    }
    if (result.status === 'pending') {
      console.error(JSON.stringify({ role, status: 'timed_out', providerRunId: result.providerRunId }));
      await cancelCreao({ ...job, providerRunId: result.providerRunId }).catch(() => {});
    }
    assert.equal(result.status, 'completed', `${role} did not complete within its configured role budget`);
    checkSmokeResult(role, input, result.output);
    console.log(JSON.stringify({ role, status: 'validated', providerRunId: result.providerRunId, elapsedMs: Date.now() - now, model: result.model }));
  }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) main().catch(error => {
  const reason = /^Provider HTTP \d{3}\.$/.test(error?.message ?? '') ? error.message : error?.name ?? 'Unknown error';
  console.error(`CREAO smoke failed (${reason}): check account configuration, provider status, role output and timing. No buyer state or order was changed.`);
  process.exitCode = 1;
});
