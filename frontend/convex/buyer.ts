import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { command } from "./buyerCommands.ts";
import { contracts } from "../src/contracts/index.ts";
import {
  requestFor,
  runFor,
  versionFor,
  owner,
  fail,
  safeError,
} from "./buyer/core.ts";
import { shortlist } from "../src/backend/buyer/comparison.ts";
export const saveDraft = command("saveDraft");
export const confirmRequest = command("confirmRequest");
export const startRun = command("startRun");
export const cancelRun = command("cancelRun");
export const reviseRequest = command("reviseRequest");
export const selectAndReserve = command("selectAndReserve");
export const approveAndExecute = command("approveAndExecute");
export const setSort = command("setSort");
export const toggleSaved = command("toggleSaved");
export const removeSaved = command("removeSaved");
export const interpretDraft = action({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<unknown> => {
    try {
      const jobId = await ctx.runMutation(internal.buyerJobs.prepareIntake, {
        input,
      });
      const state = await ctx.runAction(internal.buyerJobs.dispatch, { jobId });
      if (state.pending)
        await ctx.scheduler.runAfter(2000, internal.buyerJobs.pollIntake, {
          jobId,
        });
      return { ok: true, value: { jobId } };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  },
});
export const getDraft = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) =>
    contracts.DraftView.parse((await requestFor(ctx, requestId)).draft),
});
export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await owner(ctx);
    const rows = await ctx.db
      .query("buyerRequests")
      .withIndex("by_owner", (q) => q.eq("ownerId", user))
      .order("desc")
      .take(100);
    return rows.map((r) => ({
      requestId: String(r._id),
      draftVersion: r.draftVersion,
      version: r.version,
      activeRunId: r.activeRunId,
      updatedAt: r.updatedAt,
      title:
        contracts.DraftView.parse(r.draft)
          .messages.find((m) => m.role === "buyer")
          ?.text.slice(0, 100) ?? "Shopping request",
    }));
  },
});
export const getConfirmedRequest = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const req = await requestFor(ctx, requestId);
    return req.version ? versionFor(ctx, requestId, req.version) : null;
  },
});
export const getBuyerRun = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const req = await requestFor(ctx, args.requestId);
    const runId = req.activeRunId;
    if (!runId) return null;
    const run = await runFor(ctx, runId);
    if (!run || run.ownerId !== req.ownerId || run.requestId !== args.requestId)
      fail("FORBIDDEN", "Run unavailable.");
    const rows = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", runId).eq("effective", true),
      )
      .take(6);
    const events = await ctx.db
      .query("buyerEvents")
      .withIndex("by_run_sequence", (q) => q.eq("runId", runId))
      .order("desc")
      .take(100);
    const jobs = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .take(40);
    const confirmed = await versionFor(ctx, args.requestId, run.version);
    const cards = await Promise.all(
      rows.map(async (row) => {
        const card = contracts.OfferCard.parse(row.card);
        const merchant = await ctx.db
          .query("merchants")
          .withIndex("by_merchantId", (q) => q.eq("merchantId", row.merchantId))
          .unique();
        const current =
          run.stage === "results" &&
          req.activeRunId === runId &&
          !!merchant &&
          merchant.enabled &&
          !merchant.paused &&
          merchant.currentPolicyId === row.data.policy.id &&
          merchant.currentPolicyVersion === row.data.policy.version;
        return current
          ? card
          : {
              ...card,
              selectable: false,
              unavailableReason:
                "The run or merchant policy changed; renew the comparison.",
            };
      }),
    );
    const offers = shortlist(
      cards,
      run.config.sort ?? confirmed.sort,
      Date.now(),
    );
    return contracts.BuyerRunView.parse({
      request: confirmed.request,
      runId: runId,
      stage: run.stage,
      purchaseStage: run.purchaseStage,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      serverNow: Date.now(),
      participatingMerchantCount: new Set(
        jobs.map((j) => j.merchantId).filter(Boolean),
      ).size,
      completedMerchantCount: new Set(
        jobs
          .filter((j) => j.phase === "bidding" && j.state === "completed")
          .map((j) => j.merchantId),
      ).size,
      evidenceStatus:
        !cards.length || cards.every((c) => c.evidenceStatus === "unavailable")
          ? "unavailable"
          : cards.some((c) => c.evidenceStatus === "pending")
            ? "pending"
            : cards.every((c) => c.evidenceStatus === "cached")
              ? "cached"
              : cards.every((c) => c.evidenceStatus === "complete")
                ? "complete"
                : "partial",
      partial: run.partial,
      offers,
      events: events.reverse().map((e) => contracts.RunEvent.parse(e.data)),
      suggestedActions: [
        {
          id: "compare",
          label: "Compare delivered price and fit",
          kind: "compare_offers",
        },
        {
          id: "revise",
          label: "Revise the confirmed brief",
          kind: "revise_request",
        },
      ],
      allowedActions:
        run.purchaseStage === "complete" ||
        ["executing", "unknown"].includes(run.purchaseStage)
          ? []
          : run.stage === "results"
            ? [
                "select",
                "revise",
                ...(run.purchaseStage === "reserved" ? ["approve"] : []),
              ]
            : ["failed", "cancelled", "no_match"].includes(run.stage)
              ? ["retry", "revise"]
              : ["cancel"],
      modes: {
        inventory: "mock",
        agents: run.config.agents === "live" ? "mixed" : "fixture",
        evidence: cards.some((c) => c.evidenceStatus === "complete")
          ? "live"
          : cards.some((c) => c.evidenceStatus === "cached")
            ? "cached"
            : "unavailable",
        payment: "simulation",
      },
      error: run.error,
    });
  },
});
export const getRunEvents = query({
  args: { requestId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const req = await requestFor(ctx, args.requestId);
    const runId = req.activeRunId;
    if (!runId) {
      if (args.cursor !== null)
        fail("STALE_VERSION", "The run changed; restart event pagination.");
      return { events: [], nextCursor: null };
    }
    let after = 0;
    if (args.cursor !== null) {
      const parsed = /^([A-Za-z0-9_-]{1,128})\.(\d{1,12})$/.exec(args.cursor);
      if (!parsed) fail("INVALID_INPUT", "Invalid event cursor.");
      if (parsed[1] !== runId)
        fail("STALE_VERSION", "The run changed; restart event pagination.");
      after = Number(parsed[2]);
    }
    const rows = await ctx.db
      .query("buyerEvents")
      .withIndex("by_run_sequence", (q) =>
        q.eq("runId", runId).gt("sequence", after),
      )
      .take(101);
    const page = rows.slice(0, 100);
    return {
      events: page.map((e) => contracts.RunEvent.parse(e.data)),
      nextCursor:
        rows.length > 100 ? `${runId}.${page[page.length - 1].sequence}` : null,
    };
  },
});
export const getEvidence = query({
  args: { requestId: v.string(), runId: v.optional(v.string()), evidenceIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const req = await requestFor(ctx, args.requestId);
    if (args.evidenceIds.length > 40)
      fail("LIMIT_REACHED", "Read at most forty excerpts.");
    const runId = args.runId ?? req.activeRunId;
    if (!runId) return [];
    const run = await runFor(ctx, runId);
    if (!run || run.requestId !== args.requestId || run.ownerId !== req.ownerId) fail("FORBIDDEN", "Evidence belongs to another request.");
    const rows = await ctx.db
      .query("buyerEvidence")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .take(200);
    return rows
      .filter((e) => args.evidenceIds.includes(e.data.id))
      .map((e) => contracts.Evidence.parse(e.data));
  },
});
export const getPurchase = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    await requestFor(ctx, requestId);
    const quotes = await ctx.db
      .query("buyerQuotes")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .order("desc")
      .take(100);
    const quote = quotes[0];
    const executions = await ctx.db
      .query("buyerExecutions")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .order("desc")
      .take(1);
    return {
      quote: quote ? contracts.FirmQuote.parse(quote.data) : null,
      quoteState: quote?.state ?? null,
      products: quote?.products ?? [],
      execution: executions[0]
        ? contracts.ExecutionView.parse(executions[0].data)
        : null,
    };
  },
});
export const listSaved = query({
  args: {},
  handler: async (ctx) => {
    const user = await owner(ctx);
    const rows = await ctx.db.query("buyerBookmarks")
      .withIndex("by_owner", q => q.eq("ownerId", user))
      .take(100);
    return Promise.all(rows.map(async row => {
      const requestId = row.requestId ? ctx.db.normalizeId("buyerRequests", row.requestId) : null;
      const runId = row.runId ? ctx.db.normalizeId("buyerRuns", row.runId) : null;
      const [request, run] = await Promise.all([
        requestId ? ctx.db.get(requestId) : null,
        runId ? ctx.db.get(runId) : null,
      ]);
      const retained = request?.ownerId === user && run?.ownerId === user &&
        run?.requestId === row.requestId;
      return {
        id: String(row._id),
        requestId: retained ? row.requestId! : null,
        runId: retained ? row.runId! : null,
        card: contracts.OfferCard.parse(row.card),
        createdAt: row.createdAt,
      };
    }));
  },
});
export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    const user = await owner(ctx);
    return (
      await ctx.db
        .query("buyerOrders")
        .withIndex("by_owner", (q) => q.eq("ownerId", user))
        .order("desc")
        .take(100)
    ).map((r) => ({
      orderId: String(r._id),
      requestId: r.requestId,
      executionId: r.executionId,
      quote: contracts.FirmQuote.parse(r.quote),
      products: r.products,
      createdAt: r.createdAt,
    }));
  },
});
export const getProfiles = query({
  args: {},
  handler: async (ctx) => {
    await owner(ctx);
    const rows = await ctx.db.query("categoryProfiles").take(100);
    return rows.map((r) =>
      contracts.CategoryProfile.parse({
        profile: { id: r.profileId, version: r.version },
        category: r.category,
        allowedConditions: r.allowedConditions,
        fields: r.fields,
        variantKeyFields: r.variantKeyFields,
        compatibilityRuleId: r.compatibilityRuleId,
        evidenceRuleId: r.evidenceRuleId,
      }),
    );
  },
});
