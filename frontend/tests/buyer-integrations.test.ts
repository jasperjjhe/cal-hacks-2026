import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invokeCreao, pollCreao, cancelCreao } from '../convex/integrations/creaoBuyer';
import { startEvidence, pollEvidence, reviewQuery, matchesProduct, RAG_ACTOR_ID } from '../convex/integrations/apifyBuyer';
import { snapshotCreaoConfig } from '../convex/integrations/creaoBuyer';
import { smokeInputs, checkSmokeResult } from '../scripts/smoke-creao.mjs';
import { fixtureCouncil } from '../convex/buyer/council';
import type { EvidenceInput, ToolJob } from '../convex/integrations/buyerTools';

const job: ToolJob = { id: 'job-12345678', role: 'moderator_brief', input: { offers: [] }, providerRunId: null, deadlineAt: Date.now() + 60000 };
const input: EvidenceInput = {
  variantId: 'real-product', syntheticProduct: false, inputDigest: 'digest',
  actorId: RAG_ACTOR_ID, build: 'build1', buildNumber: '0.1.1',
  productName: 'Sony WH-1000XM5', domains: ['arstechnica.com', 'reddit.com'],
  query: reviewQuery('Sony WH-1000XM5'),
};
const run = { id: 'run1', actId: RAG_ACTOR_ID, buildId: 'build1', status: 'RUNNING', defaultDatasetId: 'dataset1' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.stubEnv('CREAO_API_KEY', 'test-secret');
  vi.stubEnv('CREAO_BUYER_CONFIG_REVISION', 'council-v2');
  vi.stubEnv('CREAO_BUYER_AGENT_IDS', JSON.stringify({ moderator_brief: 'agent1' }));
  vi.stubEnv('CREAO_BUYER_MODEL_ID', 'configured-non-default-model');
  vi.stubEnv('APIFY_TOKEN', 'test-apify-secret');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('CREAO starts once and polls a strict role result without conversation reuse', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'run1', status: 'pending', appId: 'agent1' }))
    .mockResolvedValueOnce(json({ runId: 'run1', status: 'completed', result: { text: JSON.stringify({ schemaVersion: 2, jobId: job.id, councilId: 'c1', request: {id:'req1',version:1}, runId:'r1', snapshot:{id:'s1',version:1}, snapshotDigest:'digest', phase:'brief', deadlineAt:job.deadlineAt, participants: [] }) } }));
  vi.stubGlobal('fetch', fetch);
  expect(await invokeCreao(job)).toEqual({ status: 'pending', providerRunId: 'run1' });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.idempotencyKey).toBe(`buyer:${job.id}`);
  expect(body.threadId).toBeUndefined();
  expect(JSON.parse(body.inputs.prompt).outputSchema).toBeTruthy();
  expect((await pollCreao({ ...job, providerRunId: 'run1' })).status).toBe('completed');
  expect(fetch.mock.calls[1][0]).toBe('https://agent.creao.ai/api/v1/runs/run1');
});
test('ambiguous CREAO start reuses the same idempotency key', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce(json({ id: 'run1', status: 'pending' }));
  vi.stubGlobal('fetch', fetch);
  await expect(invokeCreao(job)).rejects.toThrow('timeout');
  await pollCreao(job);
  expect(fetch.mock.calls.map((call) => JSON.parse(call[1].body).idempotencyKey)).toEqual([`buyer:${job.id}`, `buyer:${job.id}`]);
});
test('CREAO refuses seller secrets, wrong identities, malformed output and Gemini configuration', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(invokeCreao({ ...job, role: 'seller_initial', input: { operatorFloorCents: 1 } })).rejects.toThrow('role');
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(json({ id: 'wrong', status: 'pending' }));
  await expect(pollCreao({ ...job, providerRunId: 'run1' })).rejects.toThrow('identity');
  fetch.mockResolvedValueOnce(json({ id: 'run1', status: 'completed', result: { text: '{"approve":true}' } }));
  expect(await invokeCreao(job)).toEqual({ status: 'failed', providerRunId: 'run1' });
  vi.stubEnv('CREAO_BUYER_MODEL_ID', 'gemini-default');
  await expect(invokeCreao(job)).rejects.toThrow('non-Gemini');
});
test('expired CREAO job makes no call; cancellation uses only its known run', async () => {
  const fetch = vi.fn().mockResolvedValue(json({ status: 'cancelled' })); vi.stubGlobal('fetch', fetch);
  expect((await invokeCreao({ ...job, deadlineAt: 0 })).status).toBe('failed');
  await cancelCreao(job);
  expect(fetch).not.toHaveBeenCalled();
  await cancelCreao({ ...job, providerRunId: 'run1' });
  expect(fetch.mock.calls[0][0]).toBe('https://agent.creao.ai/api/v1/runs/run1/cancel');
});
test('two configured agents route intake separately and isolate the three council roles', async () => {
  vi.stubEnv('CREAO_INTAKE_AGENT_ID', 'intake-agent');
  vi.stubEnv('CREAO_COUNCIL_AGENT_ID', 'council-agent');
  const fetch = vi.fn().mockImplementation(async () => json({ id: 'run1', status: 'pending' }));
  vi.stubGlobal('fetch', fetch);
  for (const role of ['intake', 'moderator_brief', 'moderator_adjudication', 'evidence_summary']) await invokeCreao({ ...job, id: `${job.id}-${role}`, role });
  const bodies = fetch.mock.calls.map(call => JSON.parse(call[1].body));
  expect(bodies.map(b => b.appId)).toEqual(['intake-agent', 'council-agent', 'council-agent', 'council-agent']);
  expect(bodies.every(b => b.threadId === undefined)).toBe(true);
});
test('omitting the model override uses the CREAO default without claiming a model identity', async () => {
  vi.stubEnv('CREAO_BUYER_MODEL_ID', '');
  const fetch = vi.fn().mockResolvedValue(json({ id: 'run1', status: 'pending' }));
  vi.stubGlobal('fetch', fetch);
  expect(snapshotCreaoConfig(job.role)?.model).toBeNull();
  expect((await invokeCreao(job)).status).toBe('pending');
  expect(JSON.parse(fetch.mock.calls[0][1].body).chatModelId).toBeUndefined();
});
test('CREAO JSON artifacts are validated and downloaded only from the same authenticated run', async () => {
  const output = { schemaVersion: 2, jobId: job.id, councilId: 'c1', request: {id:'req1',version:1}, runId:'r1', snapshot:{id:'s1',version:1}, snapshotDigest:'digest', phase:'brief', deadlineAt:job.deadlineAt, participants: [] };
  const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'run1', status: 'completed', result: {
    text: '{"pointCount":10}', artifacts: [
      { id: 'bad', type: 'application/json', url: 'https://evil.example/result.json' },
      { id: 'good', type: 'application/json', url: 'https://agent.creao.ai/api/v1/runs/run1/artifacts/download?path=output.json' },
    ],
  } })).mockResolvedValueOnce(new Response(null, { status: 302, headers: {
    location: 'https://storage-bucket-creao-user-upload-production.s3.us-west-2.amazonaws.com/output.json?signature=demo',
  } })).mockResolvedValueOnce(json(output));
  vi.stubGlobal('fetch', fetch);
  expect((await invokeCreao(job)).status).toBe('completed');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[1][0]).toContain('/runs/run1/artifacts/download');
  expect(fetch.mock.calls[2][1].headers).toBeUndefined();
});
test('provider configuration is pinned across an ambiguous start and environment changes', async () => {
  const pinned = { ...job, config: snapshotCreaoConfig(job.role) };
  const fetch = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(json({ id: 'run1', status: 'pending' }));
  vi.stubGlobal('fetch', fetch);
  await expect(invokeCreao(pinned)).rejects.toThrow('timeout');
  vi.stubEnv('CREAO_COUNCIL_AGENT_ID', 'changed-agent');
  vi.stubEnv('CREAO_BUYER_MODEL_ID', 'changed-model');
  await pollCreao(pinned);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(JSON.parse(fetch.mock.calls[1][1].body));
});
test('copy-ready smoke inputs use canonical envelopes and verify real output semantics', () => {
  const inputs = smokeInputs(Date.now());
  checkSmokeResult('moderator_brief', inputs.moderator_brief, fixtureCouncil(inputs.moderator_brief));
  checkSmokeResult('moderator_adjudication', inputs.moderator_adjudication, fixtureCouncil(inputs.moderator_adjudication));
  expect(() => checkSmokeResult('evidence_summary', inputs.evidence_summary, { variantId: 'demo-product', positives: [{ text: 'fake review', evidenceIds: ['invented'] }], concerns: [], gaps: [] })).toThrow();
});
test('Apify pins actor/build and reads only a successful run dataset', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: run }))
    .mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([reviewRow()]));
  vi.stubGlobal('fetch', fetch);
  expect(await startEvidence(input)).toEqual({ status: 'pending', providerRunId: 'run1', build: 'build1' });
  expect(fetch.mock.calls[0][0]).toContain('build=0.1.1');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ query: input.query, maxResults: 6, outputFormats: ['markdown'], scrapingTool: 'raw-http' });
  const result = await pollEvidence(input, 'run1');
  expect(result.status).toBe('completed');
  if (result.status === 'completed') expect(result.evidence[0]).toMatchObject({ verification: 'unknown', applicability: 'family', providerRunId: 'run1', providerBuild: 'build1' });
  expect(fetch.mock.calls[2][0]).toContain('/datasets/dataset1/items?');
});
test('Apify rejects different build, dataset injection and unapproved source URLs', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: { ...run, buildId: 'wrong' } }))
    .mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([reviewRow('https://evil.example')]));
  vi.stubGlobal('fetch', fetch);
  await expect(startEvidence(input)).rejects.toThrow('provenance');
  expect(await pollEvidence(input, 'run1')).toMatchObject({ status: 'completed', evidence: [] });
  expect((await startEvidence({ ...input, syntheticProduct: true })).status).toBe('unavailable');
});
test('Apify start timeout is not retried and provider redirects and oversized responses fail closed', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('timeout'));
  vi.stubGlobal('fetch', fetch);
  await expect(startEvidence(input)).rejects.toThrow('timeout');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
  fetch.mockResolvedValueOnce(new Response('x'.repeat(1048577)));
  await expect(pollEvidence(input, 'run1')).rejects.toThrow('too large');
});

function reviewRow(url = 'https://arstechnica.com/review/sony-xm5') {
  return { metadata: { url, title: 'Sony WH-1000XM5 review' },
    crawl: { httpStatusCode: 200, requestStatus: 'succeeded', loadedAt: new Date().toISOString() },
    markdown: 'Sony WH-1000XM5 headphones. ' + 'Actual listening impressions and comfort observations. '.repeat(10) };
}
test('discovery filters stale, blocked, redirected, duplicate and wrong-model pages', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([
      reviewRow(), reviewRow(),
      { ...reviewRow(), metadata: { url: 'https://reddit.com/thread', redirectedUrl: 'https://evil.example' } },
      { ...reviewRow(), crawl: { ...reviewRow().crawl, httpStatusCode: 403 } },
      { ...reviewRow(), metadata: { url: 'https://reddit.com/wrong', title: 'Sony WF-1000XM5' }, markdown: 'Sony WF-1000XM5 earbuds compared with Sony WH-1000XM5 headphones. '.repeat(20) },
      { ...reviewRow(), crawl: { ...reviewRow().crawl, loadedAt: '2000-01-01T00:00:00Z' } },
    ]));
  vi.stubGlobal('fetch', fetch);
  const result = await pollEvidence(input, 'run1');
  expect(result.status === 'completed' && result.evidence.length).toBe(1);
  expect(matchesProduct(input.productName, 'Sony WF-1000XM5 earbuds')).toBe(false);
  expect(matchesProduct(input.productName, 'Sony WH1000XM5 headphones')).toBe(true);
});
test('discovered Reddit content stays anecdotal and queries cannot inject search operators', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([reviewRow('https://www.reddit.com/r/headphones/comments/123')]));
  vi.stubGlobal('fetch', fetch);
  const result = await pollEvidence(input, 'run1');
  expect(result.status === 'completed' && result.evidence[0]).toMatchObject({ sourceType: 'owner_report', applicability: 'family', verification: 'unknown', sourceVerifiedPurchaseLabel: null });
  await expect(startEvidence({ ...input, query: 'https://evil.example' })).rejects.toThrow('query');
  expect(reviewQuery('Sony " OR site:evil.example')).not.toContain('site:evil.example');
});
