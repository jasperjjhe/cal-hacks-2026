import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { contracts } from "../src/contracts/index.ts";
import { transitionStock } from "./buyer/inventory.ts";
import { runFor } from "./buyer/core.ts";
import { executePayment, reconcilePayment } from "./integrations/buyerTools.ts";
const executionArgs = { executionId: v.string() };
export const claimAttempt = internalMutation({
  args: { ...executionArgs, reconcile: v.boolean() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerExecutions", args.executionId);
    const attempt = id ? await ctx.db.get(id) : null;
    if (!attempt || ["succeeded", "declined"].includes(attempt.state))
      return null;
    if (
      args.reconcile
        ? attempt.state !== "unknown"
        : attempt.state !== "pending" || attempt.attemptCount > 0
    )
      return null;
    const quoteId = ctx.db.normalizeId("buyerQuotes", attempt.quoteId);
    const quote = quoteId ? await ctx.db.get(quoteId) : null;
    if (!quote || quote.state !== "execution_locked") return null;
    await ctx.db.patch(attempt._id, {
      attemptCount: attempt.attemptCount + 1,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(60000, internal.buyerExecution.recoverAttempt, {
      executionId: args.executionId,
      claimedAt: Date.now(),
    });
    return {
      executionId: args.executionId,
      quote: contracts.FirmQuote.parse(quote.data),
      scenario: attempt.scenario,
      providerReference: attempt.data.providerReference as string | null,
    };
  },
});
export const executeAttempt = internalAction({
  args: executionArgs,
  handler: async (ctx, args): Promise<void> => {
    const claim = await ctx.runMutation(internal.buyerExecution.claimAttempt, {
      ...args,
      reconcile: false,
    });
    if (!claim) return;
    let outcome;
    try {
      outcome = await executePayment(claim);
    } catch {
      outcome = { status: "unknown" as const, providerReference: null };
    }
    await ctx.runMutation(internal.buyerExecution.settleAttempt, {
      ...args,
      ...outcome,
    });
  },
});
export const reconcileAttempt = internalAction({
  args: executionArgs,
  handler: async (ctx, args): Promise<void> => {
    const claim = await ctx.runMutation(internal.buyerExecution.claimAttempt, {
      ...args,
      reconcile: true,
    });
    if (!claim) return;
    let outcome;
    try {
      outcome = await reconcilePayment(claim);
    } catch {
      outcome = {
        status: "unknown" as const,
        providerReference: claim.providerReference,
      };
    }
    await ctx.runMutation(internal.buyerExecution.settleAttempt, {
      ...args,
      ...outcome,
    });
  },
});
export const settleAttempt = internalMutation({
  args: {
    ...executionArgs,
    status: v.union(
      v.literal("succeeded"),
      v.literal("declined"),
      v.literal("pending"),
      v.literal("unknown"),
    ),
    providerReference: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerExecutions", args.executionId);
    const attempt = id ? await ctx.db.get(id) : null;
    if (!attempt || ["succeeded", "declined"].includes(attempt.state)) return;
    const quoteId = ctx.db.normalizeId("buyerQuotes", attempt.quoteId);
    const quote = quoteId ? await ctx.db.get(quoteId) : null;
    if (!quote || quote.state !== "execution_locked") return;
    const run = await runFor(ctx, quote.runId);
    if (args.status === "unknown" || args.status === "pending") {
      const view = contracts.ExecutionView.parse({
        ...attempt.data,
        status: "unknown",
        providerReference: args.providerReference,
        resultMessage:
          "The purchase result is unresolved. Do not start another attempt; the same attempt is being reconciled.",
        nextAction: "wait",
      });
      await ctx.db.patch(attempt._id, {
        state: "unknown",
        data: view,
        updatedAt: Date.now(),
      });
      if (run)
        await ctx.db.patch(run._id, {
          purchaseStage: "unknown",
          updatedAt: Date.now(),
        });
      if (attempt.attemptCount < 8)
        await ctx.scheduler.runAfter(
          5000,
          internal.buyerExecution.reconcileAttempt,
          { executionId: args.executionId },
        );
      return;
    }
    const requestId = ctx.db.normalizeId("buyerRequests", attempt.requestId);
    if (requestId) await ctx.db.patch(requestId, { updatedAt: Date.now() });
    const succeeded = args.status === "succeeded";
    await transitionStock(
      ctx,
      attempt.quoteId,
      succeeded ? "sell" : "decline",
      Date.now(),
    );
    let orderId: string | null = null;
    if (succeeded) {
      const prior = await ctx.db
        .query("buyerOrders")
        .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
        .unique();
      orderId = prior
        ? String(prior._id)
        : String(
            await ctx.db.insert("buyerOrders", {
              requestId: attempt.requestId,
              ownerId: attempt.ownerId,
              executionId: args.executionId,
              quote: quote.data,
              products: quote.products,
              createdAt: Date.now(),
            }),
          );
    }
    const view = contracts.ExecutionView.parse({
      ...attempt.data,
      status: args.status,
      providerReference: args.providerReference,
      orderId,
      resultMessage: succeeded
        ? "Demo order completed; no payment taken."
        : "The simulated purchase was declined. Select a fresh quote to try again.",
      nextAction: succeeded ? "none" : "choose_offer",
    });
    await ctx.db.patch(attempt._id, {
      state: args.status,
      data: view,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(quote._id, { state: succeeded ? "sold" : "released" });
    if (run)
      await ctx.db.patch(run._id, {
        purchaseStage: succeeded ? "complete" : "declined",
        updatedAt: Date.now(),
      });
  },
});
export const expireQuote = internalMutation({
  args: { quoteId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerQuotes", args.quoteId);
    const quote = id ? await ctx.db.get(id) : null;
    if (
      !quote ||
      quote.state !== "reserved" ||
      quote.data.expiresAt > Date.now()
    )
      return;
    await transitionStock(ctx, args.quoteId, "release", Date.now());
    await ctx.db.patch(quote._id, { state: "expired" });
  },
});
export const getAttempt = internalQuery({
  args: executionArgs,
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerExecutions", args.executionId);
    return id ? ctx.db.get(id) : null;
  },
});

// The action may stop after its claim commits. Recovery only looks up the same
// execution; it never repeats the payment operation.
export const recoverAttempt = internalMutation({
  args: { ...executionArgs, claimedAt: v.number() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerExecutions", args.executionId);
    const attempt = id ? await ctx.db.get(id) : null;
    if (!attempt || !["pending", "unknown"].includes(attempt.state) || attempt.updatedAt > args.claimedAt) return;
    if (Date.now() < args.claimedAt + 60000) return;
    await ctx.db.patch(attempt._id, { state: "unknown", updatedAt: Date.now(), data: {
      ...attempt.data, status: "unknown", nextAction: "wait",
      resultMessage: "The interrupted purchase is being reconciled. Do not start another attempt.",
    }});
    const quoteId = ctx.db.normalizeId("buyerQuotes", attempt.quoteId);
    const quote = quoteId ? await ctx.db.get(quoteId) : null;
    const run = quote ? await runFor(ctx, quote.runId) : null;
    if (run) await ctx.db.patch(run._id, { purchaseStage: "unknown", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.buyerExecution.reconcileAttempt, { executionId: args.executionId });
  },
});
