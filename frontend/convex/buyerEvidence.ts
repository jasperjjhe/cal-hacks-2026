import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { contracts } from "../src/contracts/index.ts";
import { currentRun, digest, emit } from "./buyer/core.ts";
import { startEvidence, pollEvidence } from "./integrations/buyerTools.ts";
import { loadSnapshots } from "./sellerInternal.ts";
import type { WriteCtx } from "./buyer/core.ts";
// Configure server-owned source URLs and pinned Actor build only after the
// adapter is verified. Buyer/model strings never become crawler destinations.
type Registry = {
  build: string;
  sources: { id: string; variantId: string; url: string }[];
};
function registry(): Registry {
  try {
    return JSON.parse(
      process.env.BUYER_EVIDENCE_REGISTRY ??
        '{"build":"unconfigured","sources":[]}',
    );
  } catch {
    return { build: "unconfigured", sources: [] };
  }
}
function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.port === "" &&
      !/^(localhost|.*\.local|\d[\d.]*|\[)/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}
async function prepare(
  ctx: WriteCtx,
  runId: string,
  refill: boolean,
): Promise<string[]> {
  const run = await currentRun(ctx, runId, "researching");
  if (!run) return [];
  const prior = await ctx.db
    .query("buyerResearch")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(5);
  if (refill) {
    if (run.refillCount >= 1) return [];
    await ctx.db.patch(run._id, { refillCount: 1 });
  } else if (prior.length) return prior.map((j) => String(j._id));
  const offers = await ctx.db
    .query("buyerOffers")
    .withIndex("by_run_effective", (q) =>
      q.eq("runId", runId).eq("effective", true),
    )
    .take(6);
  const ordered = offers
    .filter((o) => o.data.requirementsValidExceptBudget && o.data.affordable)
    .sort(
      (a, b) =>
        a.card.totalCents - b.card.totalCents ||
        a.candidateId.localeCompare(b.candidateId),
    );
  const identities = [
    ...new Set(ordered.map((o) => o.card.products[0].variantId as string)),
  ]
    .filter((id) => !prior.some((j) => j.variantId === id))
    .slice(0, 5 - prior.length);
  const ids: string[] = [];
  const reg = registry();
  for (const variantId of identities) {
    const row = ordered.find(
      (o) => o.card.products[0].variantId === variantId,
    )!;
    const snapshots = await loadSnapshots(ctx, row.merchantId);
    const product = snapshots.find((s) => s.variant.id === variantId)?.variant;
    if (!product) continue;
    const sources = reg.sources
      .filter((s) => s.variantId === variantId && safeUrl(s.url))
      .slice(0, 8);
    const input = {
      variantId,
      syntheticProduct: product.syntheticProduct,
      sourceIds: sources.map((s) => s.id),
      urls: sources.map((s) => s.url),
      inputDigest: "",
    };
    input.inputDigest = await digest({
      variantId,
      profile: product.profile,
      identity: product.manufacturerPartNumber,
      syntheticProduct: product.syntheticProduct,
      sources,
      build: reg.build,
    });
    const cached = await ctx.db
      .query("buyerEvidence")
      .withIndex("by_digest_time", (q) =>
        q
          .eq("digest", input.inputDigest)
          .gte("retrievedAt", Date.now() - 86400000),
      )
      .take(40);
    const id = await ctx.db.insert("buyerResearch", {
      runId,
      variantId,
      digest: input.inputDigest,
      state: cached.length
        ? "cached"
        : product.syntheticProduct || !sources.length
          ? "unavailable"
          : "queued",
      providerRunId: null,
      providerBuild: reg.build,
      input,
      deadlineAt: Math.min(run.deadlineAt, Date.now() + 60000),
      createdAt: Date.now(),
    });
    ids.push(String(id));
    if (cached.length)
      for (const source of cached)
        await ctx.db.insert("buyerEvidence", {
          variantId,
          digest: input.inputDigest,
          runId,
          data: source.data,
          retrievedAt: source.retrievedAt,
        });
    if (cached.length || product.syntheticProduct || !sources.length)
      await attach(
        ctx,
        runId,
        variantId,
        cached.map((s) => s.data),
        cached.length ? "cached" : "unavailable",
      );
  }
  return ids;
}
export const prepareResearch = internalMutation({
  args: { runId: v.string() },
  handler: (ctx, { runId }): Promise<string[]> => prepare(ctx, runId, false),
});
export const refillResearch = internalMutation({
  args: { runId: v.string() },
  handler: (ctx, { runId }): Promise<string[]> => prepare(ctx, runId, true),
});
export const claim = internalMutation({
  args: { researchJobId: v.string(), poll: v.boolean() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerResearch", args.researchJobId);
    const job = id ? await ctx.db.get(id) : null;
    if (!job || !(await currentRun(ctx, job.runId, "researching"))) return null;
    if (Date.now() >= job.deadlineAt) {
      await ctx.db.patch(job._id, { state: "unavailable" });
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return null;
    }
    if (args.poll ? job.state !== "pending" : job.state !== "queued")
      return null;
    const run = await currentRun(ctx, job.runId, "researching");
    if (!run || run.toolCalls >= 40) {
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return null;
    }
    await ctx.db.patch(run._id, { toolCalls: run.toolCalls + 1 });
    await ctx.db.patch(job._id, { state: "acquiring" });
    return job;
  },
});
export const acquire = internalAction({
  args: { researchJobId: v.string(), poll: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.runMutation(internal.buyerEvidence.claim, {
      researchJobId: args.researchJobId,
      poll: args.poll ?? false,
    });
    if (!job) return false;
    let result;
    try {
      result = args.poll
        ? await pollEvidence(job.input, job.providerRunId!)
        : await startEvidence(job.input);
    } catch {
      result = { status: "unavailable" as const };
    }
    try {
      return await ctx.runMutation(internal.buyerEvidence.complete, {
        researchJobId: args.researchJobId,
        result,
      });
    } catch {
      return ctx.runMutation(internal.buyerEvidence.complete, {
        researchJobId: args.researchJobId,
        result: { status: "unavailable" },
      });
    }
  },
});
export const complete = internalMutation({
  args: { researchJobId: v.string(), result: v.any() },
  handler: async (ctx, args): Promise<boolean> => {
    const id = ctx.db.normalizeId("buyerResearch", args.researchJobId);
    const job = id ? await ctx.db.get(id) : null;
    if (
      !job ||
      job.state !== "acquiring" ||
      !(await currentRun(ctx, job.runId, "researching"))
    )
      return false;
    const result = args.result;
    if (result.status === "unavailable" || Date.now() >= job.deadlineAt) {
      await ctx.db.patch(job._id, { state: "unavailable" });
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return false;
    }
    if (
      !["pending", "completed"].includes(result.status) ||
      result.build !== job.providerBuild ||
      typeof result.providerRunId !== "string" ||
      !result.providerRunId ||
      (job.providerRunId && result.providerRunId !== job.providerRunId)
    )
      throw new Error("Evidence provenance mismatch");
    if (result.status === "pending") {
      await ctx.db.patch(job._id, {
        state: "pending",
        providerRunId: result.providerRunId,
      });
      return true;
    }
    const evidence = contracts.Evidence.array().max(40).parse(result.evidence);
    const seen = new Set<string>();
    const allowed = job.input.urls as string[];
    for (const e of evidence) {
      if (
        e.variantId !== job.variantId ||
        e.providerRunId !== result.providerRunId ||
        e.providerBuild !== job.providerBuild ||
        !safeUrl(e.url) ||
        !allowed.includes(e.url) ||
        e.retrievedAt > Date.now() ||
        e.retrievedAt < Date.now() - 86400000 ||
        (job.input.syntheticProduct && e.sourceType === "owner_report")
      )
        throw new Error("Inapplicable evidence");
    }
    const unique = evidence.filter((e) => {
      const key = `${e.url}:${e.duplicateGroup}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (const e of unique)
      await ctx.db.insert("buyerEvidence", {
        variantId: job.variantId,
        digest: job.digest,
        runId: job.runId,
        data: e,
        retrievedAt: e.retrievedAt,
      });
    await ctx.db.patch(job._id, {
      state: "completed",
      providerRunId: result.providerRunId,
    });
    await attach(
      ctx,
      job.runId,
      job.variantId,
      unique,
      unique.length ? "complete" : "unavailable",
    );
    return false;
  },
});
async function attach(
  ctx: WriteCtx,
  runId: string,
  variantId: string,
  evidence: import("../src/contracts/index.ts").Contract<"Evidence">[],
  status: string,
) {
  const rows = await ctx.db
    .query("buyerOffers")
    .withIndex("by_run_effective", (q) =>
      q.eq("runId", runId).eq("effective", true),
    )
    .take(6);
  for (const row of rows)
    if (row.card.products[0].variantId === variantId) {
      // Authoritative exact-identity contradictions block selection pending S's
      // reassessment. Family/owner commentary can never certify or negate fit.
      const contradicted = evidence.some(
        (e) =>
          e.applicability === "exact_variant" &&
          e.sourceType !== "owner_report" &&
          e.verification === "contradicted",
      );
      await ctx.db.patch(row._id, {
        data: {
          ...row.data,
          ...(contradicted
            ? { requirementsValidExceptBudget: false, selectable: false }
            : {}),
        },
        card: {
          ...row.card,
          evidenceStatus: status,
          evidenceIds: evidence.map((e) => e.id),
          mainConcern: contradicted
            ? "An authoritative exact-product fact contradicts this offer; revalidation is required."
            : status === "unavailable"
              ? "Applicable independent and owner evidence is unavailable. Demo product facts are synthetic."
              : "Read exact-variant and family source applicability before deciding.",
        },
      });
    }
  await emit(
    ctx,
    runId,
    "research_updated",
    status === "unavailable"
      ? "Applicable source evidence is unavailable; no review or rating was invented."
      : "Applicable source evidence was attached with provenance and retrieval dates.",
  );
}
