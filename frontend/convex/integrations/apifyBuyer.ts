import { z } from 'zod';
import { contracts } from '../../src/contracts/index.ts';
import { providerJson } from './buyerHttp.ts';
import type { EvidenceInput, EvidenceResult } from './buyerTools.ts';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const evidenceRegistry = z.object({
  build: z.string().min(1).max(128),
  actorId: id.optional(),
  buildNumber: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  sources: z.array(z.strictObject({
    id: contracts.Ref.shape.id, variantId: contracts.Ref.shape.id, url: z.url().max(2048),
    sourceType: contracts.Evidence.shape.sourceType.default('independent_test'),
    applicability: contracts.Evidence.shape.applicability.default('family'),
  })).max(100),
});
function config(input: EvidenceInput) {
  const token = process.env.APIFY_TOKEN;
  if (!token || input.syntheticProduct || !input.urls.length) return null;
  const actorId = id.parse(input.actorId);
  const build = id.parse(input.build);
  const buildNumber = z.string().regex(/^\d+\.\d+\.\d+$/).parse(input.buildNumber);
  if (!input.sources || input.sources.length !== input.urls.length || input.urls.length > 8)
    throw new Error('Evidence sources are not configured.');
  const hosts = input.urls.map((value, i) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        /^(localhost|.*\.local|\d[\d.]*|\[)/i.test(url.hostname) ||
        input.sources![i].url !== value || input.sources![i].id !== input.sourceIds[i])
      throw new Error('Evidence URL is not approved.');
    return url.hostname;
  });
  return { actorId, build, buildNumber, token, hosts };
}
async function outcome(input: EvidenceInput, value: unknown, expectedRunId?: string): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  const { data: run } = z.object({ data: z.object({
    id, actId: id, buildId: id, status: z.string(),
    defaultDatasetId: id.nullable().optional(),
  }) }).parse(value);
  if (run.actId !== cfg.actorId || run.buildId !== cfg.build || (expectedRunId && run.id !== expectedRunId))
    throw new Error('Apify run provenance mismatch.');
  if (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status))
    return { status: 'pending', providerRunId: run.id, build: run.buildId };
  if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) return { status: 'unavailable' };
  const rows = z.array(z.strictObject({
    url: z.url().max(2048), excerpt: z.string().min(1).max(4000),
    retrievedAt: z.number().int().nonnegative(),
  })).max(40).parse(await providerJson(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=41`, cfg.token,
  ));
  const evidence = rows.map((row, index) => {
    const source = input.sources!.find((s) => s.url === row.url);
    if (!source || row.retrievedAt > Date.now() || row.retrievedAt < Date.now() - 86400000)
      throw new Error('Apify returned an unapproved or stale source.');
    return contracts.Evidence.parse({
      id: `apify:${run.id}:${index}`, variantId: input.variantId,
      applicability: source.applicability, sourceType: source.sourceType,
      url: row.url, sourceDate: null, retrievedAt: row.retrievedAt,
      claim: 'Retrieved source excerpt; no independent claim verification performed.',
      excerpt: row.excerpt, sourceVerifiedPurchaseLabel: null,
      verification: 'unknown', providerRunId: run.id, providerBuild: run.buildId,
      duplicateGroup: source.id,
    });
  });
  return { status: 'completed', providerRunId: run.id, build: run.buildId, evidence };
}
export async function startEvidence(input: EvidenceInput): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  // No automatic start retry: Apify's run endpoint has no documented run idempotency key.
  return outcome(input, await providerJson(
    `https://api.apify.com/v2/actors/${cfg.actorId}/runs?build=${cfg.buildNumber}&timeout=60&memory=128&restartOnError=false`,
    cfg.token, { urls: input.urls, allowedHosts: cfg.hosts },
  ));
}
export async function pollEvidence(input: EvidenceInput, runId: string): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  return outcome(input, await providerJson(`https://api.apify.com/v2/actor-runs/${id.parse(runId)}`, cfg.token), runId);
}
