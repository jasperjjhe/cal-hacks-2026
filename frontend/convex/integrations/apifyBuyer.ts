import { z } from 'zod';
import { contracts } from '../../src/contracts/index.ts';
import { providerJson } from './buyerHttp.ts';
import type { EvidenceInput, EvidenceResult } from './buyerTools.ts';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const RAG_ACTOR_ID = '3ox4R101TgZz67sLr';
const domain = z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/);
export const REDDIT_ACTOR_ID = '9sHOY9RzPYGjmTHo8';
export const redditConfig = z.object({
  actorId: z.literal(REDDIT_ACTOR_ID).default(REDDIT_ACTOR_ID),
  build: id,
  buildNumber: z.string().regex(/^\d+\.\d+\.\d+$/),
  community: z.string().regex(/^[A-Za-z0-9_]{1,50}$/).optional(),
});
export const evidenceRegistry = z.object({
  reddit: redditConfig.optional(),
  actorId: z.literal(RAG_ACTOR_ID).default(RAG_ACTOR_ID),
  build: id,
  buildNumber: z.string().regex(/^\d+\.\d+\.\d+$/),
  domains: z.array(domain).min(1).max(12).default([
    'rtings.com', 'soundguys.com', 'whathifi.com', 'techradar.com',
    'tomsguide.com', 'arstechnica.com', 'reddit.com',
    'headphonesty.com', 'headphonesaddict.com', 'hifioasis.com',
    'soundphilereview.com', 'techgearlab.com',
  ]),
});
export function reviewQuery(productName: string) {
  // Catalog identity only: private buyer messages never enter provider searches.
  let name = productName.replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const words = name.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  const models = words.filter(w => /\d/.test(w));
  if (models.length) name = [...new Set([words[0], ...models])].join(' ');
  return `${name} review`;
}
export function approvedReviewUrl(value: string, domains: string[]) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}
export function matchesProduct(productName: string, text: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const words = productName.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  const models = words.filter(w => /\d/.test(w));
  const terms = models.length ? [words[0]!, ...models] : words.filter(w => !['black', 'white', 'silver', 'blue'].includes(w));
  const content = normalize(text);
  return terms.length > 0 && terms.every(term => content.includes(normalize(term)));
}
function config(input: EvidenceInput) {
  const token = process.env.APIFY_TOKEN;
  if (!token || input.syntheticProduct || !input.productName) return null;
  const cfg = evidenceRegistry.parse(input);
  if (input.query !== reviewQuery(input.productName))
    throw new Error('Evidence query is not approved.');
  return { ...cfg, token };
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
  const rows = z.array(z.object({
    markdown: z.string().max(250000).optional(),
    crawl: z.object({ httpStatusCode: z.number(), loadedAt: z.string(), requestStatus: z.string() }),
    metadata: z.object({ title: z.string().optional(), url: z.string().optional(), redirectedUrl: z.string().optional() }),
    searchResult: z.object({ url: z.string() }).optional(),
  })).max(6).parse(await providerJson(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=7&fields=markdown,crawl,metadata.title,metadata.url,metadata.redirectedUrl,searchResult.url`, cfg.token,
  ));
  const seen = new Set<string>();
  const evidence = [];
  for (const row of rows) {
    const url = row.metadata.redirectedUrl || row.metadata.url || row.searchResult?.url || '';
    const retrievedAt = Date.parse(row.crawl.loadedAt);
    const text = row.markdown?.trim() ?? '';
    if (row.crawl.httpStatusCode !== 200 || !['handled', 'succeeded'].includes(row.crawl.requestStatus) ||
        !Number.isFinite(retrievedAt) || retrievedAt > Date.now() || retrievedAt < Date.now() - 86400000 ||
        !approvedReviewUrl(url, cfg.domains) ||
        (/\d/.test(row.metadata.title ?? '') && !matchesProduct(input.productName, row.metadata.title ?? '')) ||
        !matchesProduct(input.productName, `${row.metadata.title ?? ''}\n${text}`) ||
        text.length < 100) continue;
    const canonical = new URL(url); canonical.hash = ''; canonical.search = '';
    if (seen.has(canonical.href)) continue;
    seen.add(canonical.href);
    const host = canonical.hostname;
    const owner = host === 'reddit.com' || host.endsWith('.reddit.com') || canonical.pathname.startsWith('/civis/');
    // Discovery establishes model-level relevance, never exact color/region or purchase verification.
    for (let offset = 0; offset < Math.min(text.length, 12000); offset += 4000) {
      evidence.push(contracts.Evidence.parse({
        id: `apify:${run.id}:${evidence.length}`, variantId: input.variantId,
        applicability: 'family', sourceType: owner ? 'owner_report' : 'independent_test',
        url, sourceDate: null, retrievedAt,
        claim: 'Automatically discovered source excerpt; relevance and claims are not independently verified.',
        excerpt: text.slice(offset, offset + 4000), sourceVerifiedPurchaseLabel: null,
        verification: 'unknown', providerRunId: run.id, providerBuild: run.buildId,
        duplicateGroup: `apify:${run.id}:source:${seen.size}`,
      }));
    }
  }
  return { status: 'completed', providerRunId: run.id, build: run.buildId, evidence };
}
export async function startEvidence(input: EvidenceInput): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  // No automatic start retry: ambiguous transport failure can still incur remote usage.
  return outcome(input, await providerJson(
    `https://api.apify.com/v2/actors/${cfg.actorId}/runs?build=${cfg.buildNumber}&timeout=60&memory=4096&restartOnError=false`,
    cfg.token, { query: input.query, maxResults: 6, outputFormats: ['markdown'],
      scrapingTool: 'raw-http', requestTimeoutSecs: 40 },
  ));
}
export async function pollEvidence(input: EvidenceInput, runId: string): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  return outcome(input, await providerJson(`https://api.apify.com/v2/actor-runs/${id.parse(runId)}`, cfg.token), runId);
}
