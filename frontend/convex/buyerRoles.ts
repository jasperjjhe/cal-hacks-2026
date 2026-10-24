import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { currentRun, versionFor, digest } from "./buyer/core.ts";
export const prepareModerator = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<string | null> => {
    const run = await currentRun(ctx, runId, "council");
    if (!run) return null;
    const prior = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run_phase", (q) =>
        q.eq("runId", runId).eq("phase", "council"),
      )
      .filter((q) => q.eq(q.field("role"), "moderator"))
      .first();
    if (prior) return String(prior._id);
    const request = await versionFor(ctx, run.requestId, run.version);
    const offers = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", runId).eq("effective", true),
      )
      .take(6);
    const input = {
      requirements: request.brief.lines,
      offers: offers.map((o) => ({
        offer: o.data.offer,
        merchantId: o.merchantId,
        claims: o.data.claims,
        fit: o.card.fit,
        products: o.card.products,
      })),
      sourceIds: [],
    };
    return String(
      await ctx.db.insert("buyerJobs", {
        runId,
        requestId: run.requestId,
        version: run.version,
        phase: "council",
        role: "moderator",
        merchantId: null,
        candidateId: null,
        sellerJobId: null,
        state: "queued",
        input,
        inputDigest: await digest(input),
        provider: run.config.agents === "live" ? "creao" : "fixture",
        providerRunId: null,
        outputDigest: null,
        output: null,
        deadlineAt: Math.min(
          run.deadlineAt,
          run.startedAt + 75000,
          Date.now() + 30000,
        ),
        createdAt: Date.now(),
        completedAt: null,
      }),
    );
  },
});
export const prepareSummaries = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<string[]> => {
    const run = await currentRun(ctx, runId, "researching");
    if (!run) return [];
    const prior = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run_phase", (q) =>
        q.eq("runId", runId).eq("phase", "researching"),
      )
      .take(5);
    if (prior.length) return prior.map((j) => String(j._id));
    const evidence = await ctx.db
      .query("buyerEvidence")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .take(200);
    const ids: string[] = [];
    for (const variantId of [
      ...new Set(evidence.map((e) => e.variantId)),
    ].slice(0, 5)) {
      const input = {
        variantId,
        evidence: evidence
          .filter((e) => e.variantId === variantId)
          .map((e) => e.data),
      };
      ids.push(
        String(
          await ctx.db.insert("buyerJobs", {
            runId,
            requestId: run.requestId,
            version: run.version,
            phase: "researching",
            role: "evidence_summary",
            merchantId: null,
            candidateId: null,
            sellerJobId: null,
            state: "queued",
            input,
            inputDigest: await digest(input),
            provider: run.config.agents === "live" ? "creao" : "fixture",
            providerRunId: null,
            outputDigest: null,
            output: null,
            deadlineAt: Math.min(run.deadlineAt, Date.now() + 15000),
            createdAt: Date.now(),
            completedAt: null,
          }),
        ),
      );
    }
    return ids;
  },
});
