import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invokeCreao, pollCreao, cancelCreao } from '../convex/integrations/creaoBuyer';
import { startEvidence, pollEvidence } from '../convex/integrations/apifyBuyer';
import type { EvidenceInput, ToolJob } from '../convex/integrations/buyerTools';

const job: ToolJob = { id: 'job-12345678', role: 'moderator', input: { offers: [] }, providerRunId: null, deadlineAt: Date.now() + 60000 };
const input: EvidenceInput = {
  variantId: 'real-product', syntheticProduct: false, inputDigest: 'digest',
  actorId: 'actor1', build: 'build1', buildNumber: '0.1.1',
  urls: ['https://example.com/product'], sourceIds: ['source1'],
  sources: [{ id: 'source1', url: 'https://example.com/product', applicability: 'family', sourceType: 'manufacturer' }],
};
const run = { id: 'run1', actId: 'actor1', buildId: 'build1', status: 'RUNNING', defaultDatasetId: 'dataset1' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.stubEnv('CREAO_API_KEY', 'test-secret');
  vi.stubEnv('CREAO_BUYER_AGENT_IDS', JSON.stringify({ moderator: 'agent1' }));
  vi.stubEnv('CREAO_BUYER_MODEL_ID', 'configured-non-default-model');
  vi.stubEnv('APIFY_TOKEN', 'test-apify-secret');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('CREAO starts once and polls a strict role result without conversation reuse', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'run1', status: 'pending', appId: 'agent1' }))
    .mockResolvedValueOnce(json({ runId: 'run1', status: 'completed', result: { text: JSON.stringify({ challenges: [], summary: 'No material challenge.' }) } }));
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
test('Apify pins actor/build and reads only a successful run dataset', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: run }))
    .mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([{ url: input.urls[0], excerpt: 'Actual source text.', retrievedAt: Date.now() }]));
  vi.stubGlobal('fetch', fetch);
  expect(await startEvidence(input)).toEqual({ status: 'pending', providerRunId: 'run1', build: 'build1' });
  expect(fetch.mock.calls[0][0]).toContain('build=0.1.1');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ urls: input.urls, allowedHosts: ['example.com'] });
  const result = await pollEvidence(input, 'run1');
  expect(result.status).toBe('completed');
  if (result.status === 'completed') expect(result.evidence[0]).toMatchObject({ verification: 'unknown', applicability: 'family', providerRunId: 'run1', providerBuild: 'build1' });
  expect(fetch.mock.calls[2][0]).toContain('/datasets/dataset1/items?');
});
test('Apify rejects different build, dataset injection and unapproved source URLs', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ data: { ...run, buildId: 'wrong' } }))
    .mockResolvedValueOnce(json({ data: { ...run, status: 'SUCCEEDED' } }))
    .mockResolvedValueOnce(json([{ url: 'https://evil.example', excerpt: 'injected', retrievedAt: Date.now() }]));
  vi.stubGlobal('fetch', fetch);
  await expect(startEvidence(input)).rejects.toThrow('provenance');
  await expect(pollEvidence(input, 'run1')).rejects.toThrow('unapproved');
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
