import { z } from 'zod';
import { contracts } from '../../src/contracts/index.ts';
import { providerJson } from './buyerHttp.ts';
import { redditConfig, reviewQuery, approvedReviewUrl, matchesProduct } from './apifyBuyer.ts';
import type { EvidenceInput, EvidenceResult } from './buyerTools.ts';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
function config(input: EvidenceInput) {
  const token = process.env.APIFY_TOKEN;
  if (!token || input.syntheticProduct || !input.productName || !input.domains.includes('reddit.com')) return null;
  const cfg = redditConfig.parse(input);
  if (input.query !== reviewQuery(input.productName)) throw new Error('Evidence query is not approved.');
  return { ...cfg, token };
}
async function outcome(input: EvidenceInput, value: unknown, expectedRunId?: string): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  const { data: run } = z.object({ data: z.object({ id, actId: id, buildId: id, status: z.string(), defaultDatasetId: id.optional() }) }).parse(value);
  if (run.actId !== cfg.actorId || run.buildId !== cfg.build || (expectedRunId && run.id !== expectedRunId)) throw new Error('Reddit run provenance mismatch.');
  if (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) return { status: 'pending', providerRunId: run.id, build: run.buildId };
  if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) return { status: 'unavailable' };
  const rows = z.array(z.object({
    url: z.string(), body: z.string().max(100000), dataType: z.string(),
    postTitle: z.string(), postId: z.string(), crawledAt: z.string(), commentCreatedAt: z.string(),
  })).max(12).parse(await providerJson(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=13&fields=url,body,dataType,postTitle,postId,crawledAt,commentCreatedAt`, cfg.token,
  ));
  const seen = new Set<string>();
  const evidence = [];
  for (const row of rows) {
    const retrievedAt = Date.parse(row.crawledAt);
    if (row.dataType !== 'comment' || !approvedReviewUrl(row.url, ['reddit.com']) ||
        !/^\/r\/[^/]+\/comments\/[^/]+\/[^/]+\/[^/]+\/?$/.test(new URL(row.url).pathname) ||
        !Number.isFinite(retrievedAt) || retrievedAt > Date.now() || retrievedAt < Date.now() - 86400000 ||
        row.body.trim().length < 80 || ['[removed]', '[deleted]'].includes(row.body.trim()) ||
        !matchesProduct(input.productName, `${row.postTitle}\n${row.body}`) || seen.has(row.url)) continue;
    if (cfg.community && new URL(row.url).pathname.split('/')[2]?.toLowerCase() !== cfg.community.toLowerCase()) continue;
    seen.add(row.url);
    const sourceDate = Number.isFinite(Date.parse(row.commentCreatedAt)) ? row.commentCreatedAt : null;
    evidence.push(contracts.Evidence.parse({
      id: `apify:${run.id}:${evidence.length}`, variantId: input.variantId,
      applicability: 'family', sourceType: 'owner_report', url: row.url,
      sourceDate, retrievedAt, claim: 'Public Reddit comment; ownership and claims are unverified.',
      excerpt: row.body.trim().slice(0, 4000), sourceVerifiedPurchaseLabel: null,
      verification: 'unknown', providerRunId: run.id, providerBuild: run.buildId,
      duplicateGroup: `reddit:${row.postId}`.slice(0, 128),
    }));
  }
  return { status: 'completed', providerRunId: run.id, build: run.buildId, evidence };
}
export async function startRedditEvidence(input: EvidenceInput): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  // No retries or paid Actor AI enrichment; CREAO summarizes the cited comments.
  return outcome(input, await providerJson(
    `https://api.apify.com/v2/actors/${cfg.actorId}/runs?build=${cfg.buildNumber}&timeout=45&memory=256&restartOnError=false&maxTotalChargeUsd=0.2`,
    cfg.token, { searchTerms: [input.query.replace(/ review$/, '')], searchPosts: false,
      searchComments: true, searchSort: 'relevance', maxCommentsCount: 12, maxPostsCount: 1,
      crawlCommentsPerPost: false, aiAnalysis: false, ...(cfg.community ? { withinCommunity: cfg.community } : {}) },
  ));
}
export async function pollRedditEvidence(input: EvidenceInput, runId: string): Promise<EvidenceResult> {
  const cfg = config(input);
  if (!cfg) return { status: 'unavailable' };
  return outcome(input, await providerJson(`https://api.apify.com/v2/actor-runs/${id.parse(runId)}`, cfg.token), runId);
}
