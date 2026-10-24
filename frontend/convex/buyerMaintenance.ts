import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { releaseRequestHolds } from "./buyer/inventory";
import { v } from "convex/values";
export const retain = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const cutoff = Date.now() - 7 * 86400000;
    const page = await ctx.db
      .query("buyerRequests")
      .withIndex("by_updated", (q) => q.lt("updatedAt", cutoff))
      .paginate({ cursor: args.cursor ?? null, numItems: 10 });
    const requests = page.page;
    let deleted = 0;
    for (const req of requests) {
      const requestId = String(req._id);
      const executions = await ctx.db
        .query("buyerExecutions")
        .withIndex("by_request", (q) => q.eq("requestId", requestId))
        .take(100);
      if (executions.some((e) => ["pending", "unknown"].includes(e.state)))
        continue;
      const runs = await ctx.db
        .query("buyerRuns")
        .withIndex("by_request", (q) => q.eq("requestId", requestId))
        .take(100);
      if (
        runs.some(
          (r) =>
            !["results", "no_match", "cancelled", "failed"].includes(r.stage),
        )
      )
        continue;
      await releaseRequestHolds(ctx, requestId);
      for (const run of runs) {
        const runId = String(run._id);
        for (const job of await ctx.db
          .query("buyerJobs")
          .withIndex("by_run", (q) => q.eq("runId", runId))
          .take(100))
          await ctx.db.delete(job._id);
        for (const row of await ctx.db
          .query("buyerOffers")
          .withIndex("by_run_effective", (q) => q.eq("runId", runId))
          .take(100))
          await ctx.db.delete(row._id);
        for (const row of await ctx.db
          .query("buyerEvents")
          .withIndex("by_run_sequence", (q) => q.eq("runId", runId))
          .take(100))
          await ctx.db.delete(row._id);
        for (const row of await ctx.db
          .query("buyerResearch")
          .withIndex("by_run", (q) => q.eq("runId", runId))
          .take(10))
          await ctx.db.delete(row._id);
        for (const row of await ctx.db
          .query("buyerEvidence")
          .withIndex("by_run", (q) => q.eq("runId", runId))
          .take(200))
          await ctx.db.delete(row._id);
        for (const round of await ctx.db
          .query("buyerRounds")
          .withIndex("by_run", (q) => q.eq("runId", runId))
          .take(1)) {
          for (const row of await ctx.db
            .query("buyerSubmissions")
            .withIndex("by_round_candidate", (q) =>
              q.eq("roundId", String(round._id)),
            )
            .take(6))
            await ctx.db.delete(row._id);
          await ctx.db.delete(round._id);
        }
        if (run.workflowId)
          await ctx.scheduler.runAfter(
            0,
            internal.buyerMaintenance.cleanupWorkflow,
            { workflowId: run.workflowId },
          );
        await ctx.db.delete(run._id);
      }
      for (const job of await ctx.db
        .query("buyerJobs")
        .withIndex("by_request", (q) => q.eq("requestId", requestId))
        .take(100))
        await ctx.db.delete(job._id);
      for (const row of await ctx.db
        .query("buyerRequestVersions")
        .withIndex("by_request_version", (q) => q.eq("requestId", requestId))
        .take(100))
        await ctx.db.delete(row._id);
      const quotes = await ctx.db
        .query("buyerQuotes")
        .withIndex("by_request", (q) => q.eq("requestId", requestId))
        .take(100);
      for (const quote of quotes) {
        for (const approval of await ctx.db
          .query("buyerApprovals")
          .withIndex("by_quote", (q) => q.eq("quoteId", String(quote._id)))
          .take(1))
          await ctx.db.delete(approval._id);
        await ctx.db.delete(quote._id);
      }
      for (const execution of executions) {
        for (const order of await ctx.db
          .query("buyerOrders")
          .withIndex("by_execution", (q) =>
            q.eq("executionId", String(execution._id)),
          )
          .take(1))
          await ctx.db.delete(order._id);
        await ctx.db.delete(execution._id);
      }
      // Keep the stock ledger (including sold units) so retention cannot restock
      // inventory. It contains no raw conversation or product source excerpts.
      await ctx.db.delete(req._id);
      deleted++;
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.buyerMaintenance.retain, {
        cursor: page.continueCursor,
      });
    return { deleted };
  },
});
import { cleanup, type WorkflowId } from "@convex-dev/workflow";
import { components } from "./_generated/api";
export const cleanupWorkflow = internalMutation({
  args: { workflowId: v.string() },
  handler: async (ctx, { workflowId }) => {
    try {
      await cleanup(ctx, components.workflow, workflowId as WorkflowId);
    } catch {
      /* A still-running/unresolved workflow is retained for the next sweep. */
    }
  },
});
