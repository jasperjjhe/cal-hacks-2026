import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { z } from "zod";
import { contracts } from "../../src/contracts/index.ts";
import { validateSellerProposal } from "../lib/sellerValidation.ts";
import { getPolicy, toPolicy, loadSnapshots } from "../sellerInternal.ts";
import { requireMerchant } from "../sellerAuth.ts";
import {
  requestFor,
  runFor,
  versionFor,
  replay,
  saveCommand,
  fail,
  digest,
  arrivalAt,
  enforceUnlocked,
  keySchema,
  setting,
} from "./core.ts";
import {
  reserveStock,
  releaseRequestHolds,
  transitionStock,
} from "./inventory.ts";

export const selectAndReserve = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({
        request: contracts.Ref,
        runId: contracts.Ref.shape.id,
        offer: contracts.Ref,
        clientKey: keySchema,
      })
      .parse(input);
    const req = await requestFor(ctx, args.request.id);
    const command = await replay(ctx, "selectAndReserve", args.clientKey, args);
    if (command.prior) return command.prior.result;
    if (req.version !== args.request.version || req.activeRunId !== args.runId)
      fail("STALE_VERSION", "Select an offer from the current request.");
    await enforceUnlocked(ctx, args.request.id);
    const run = await runFor(ctx, args.runId);
    if (!run || run.stage !== "results" || run.purchaseStage === "complete")
      fail("STALE_VERSION", "Wait for current comparison results.");
    const rows = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", args.runId).eq("effective", true),
      )
      .take(6);
    const selected = rows.find(
      (row) =>
        row.data.offer.id === args.offer.id &&
        row.data.offer.version === args.offer.version,
    );
    if (!selected)
      fail("STALE_VERSION", "This offer was superseded or invalidated.");
    const offer = contracts.OfferVersion.parse(selected.data);
    if (!offer.requirementsValidExceptBudget)
      fail(
        "POLICY_REJECTED",
        "Required facts need revalidation before selection.",
      );
    const request = await versionFor(
      ctx,
      args.request.id,
      args.request.version,
    );
    const merchant = await requireMerchant(ctx, offer.merchantId);
    if (!merchant.enabled || merchant.paused)
      fail("POLICY_REJECTED", "This merchant is paused.");
    if (
      merchant.currentPolicyId !== offer.policy.id ||
      merchant.currentPolicyVersion !== offer.policy.version
    )
      fail("STALE_VERSION", "Seller terms changed. Run a fresh comparison.");
    // Release and reserve inside this single transaction. A later failure rolls
    // back every release, preserving the old selection without a partial hold.
    await releaseRequestHolds(ctx, args.request.id);
    const policy = toPolicy(await getPolicy(ctx, offer.policy));
    const snapshots = await loadSnapshots(ctx, offer.merchantId);
    const proposal = {
      schemaVersion: 1 as const,
      jobId: selected.snapshot.sellerJobId as string,
      candidateId: selected.candidateId,
      parentOffer: null,
      policy: offer.policy,
      lines: offer.lines,
      claims: offer.claims,
      fitArgument: "",
      privatePriceRationale: "",
    };
    const assessed = validateSellerProposal(
      {
        jobId: proposal.jobId,
        merchantId: offer.merchantId,
        brief: { ...request.brief, runId: args.runId },
        policy,
        candidates: [selected.candidateId],
        catalog: snapshots,
        now: Date.now(),
      },
      proposal,
    );
    if (!assessed.ok)
      fail(
        "POLICY_REJECTED",
        "Stock, product facts or seller terms no longer qualify.",
      );
    const arrival = arrivalAt(Date.now(), policy.arrivalCalendarDays);
    if (arrival > request.brief.deliveryDeadline)
      fail(
        "EXPIRED",
        "Fresh delivery can no longer meet your confirmed deadline.",
      );
    if (assessed.offer.totalCents > request.privateMaximumCents)
      fail(
        "POLICY_REJECTED",
        "The delivered total exceeds your private maximum.",
      );
    const products = offer.lines.map((line) => {
      const snapshot = snapshots.find(
        (s) =>
          s.listing.listing.id === line.listing.id &&
          s.listing.listing.version === line.listing.version,
      )!;
      return {
        requestLineId: line.requestLineId,
        variantId: snapshot.variant.id,
        title: snapshot.variant.title,
        condition: snapshot.listing.condition,
        quantity: line.quantity,
        attributes: snapshot.variant.attributes,
        diagnostics: snapshot.listing.diagnosticAttributes,
        syntheticProduct: snapshot.variant.syntheticProduct,
      };
    });
    if (process.env.PAYMENT_MODE && process.env.PAYMENT_MODE !== "simulation")
      fail(
        "PROVIDER_UNAVAILABLE",
        "External payment is not enabled until its adapter is configured.",
      );
    const now = Date.now();
    const id = await ctx.db.insert("buyerQuotes", {
      requestId: args.request.id,
      ownerId: req.ownerId,
      runId: args.runId,
      data: null,
      products,
      snapshot: assessed.offer,
      state: "reserved",
    });
    const reservationId = String(id);
    const terms = {
      schemaVersion: 1,
      request: args.request,
      offer: args.offer,
      policy: offer.policy,
      lines: offer.lines,
      products,
      totalCents: assessed.offer.totalCents,
      shippingCents: policy.shippingCents,
      taxCents: 0,
      currency: "USD",
      arrivalAt: arrival,
      warrantyMonths: policy.warrantyMonths,
      returnDays: policy.returnDays,
      expiresAt: now + 180000,
      paymentMode: "simulation",
      operation: "demo_order",
    };
    const quote = contracts.FirmQuote.parse({
      quoteId: String(id),
      request: args.request,
      offer: args.offer,
      merchantId: offer.merchantId,
      policy: offer.policy,
      lines: offer.lines,
      totalCents: assessed.offer.totalCents,
      shippingCents: policy.shippingCents,
      taxCents: 0,
      currency: "USD",
      arrivalAt: arrival,
      warrantyMonths: policy.warrantyMonths,
      returnDays: policy.returnDays,
      createdAt: now,
      expiresAt: now + 180000,
      quoteHash: await digest(terms),
      reservationId,
      paymentMode: "simulation",
      operation: "demo_order",
    });
    await reserveStock(ctx, {
      allocationIdPrefix: reservationId,
      reservationKey: reservationId,
      requestId: args.request.id,
      quoteId: String(id),
      merchantId: offer.merchantId,
      lines: offer.lines,
      expiresAt: quote.expiresAt,
      now,
    });
    await ctx.db.patch(id, { data: quote });
    await ctx.db.patch(run._id, { purchaseStage: "reserved", updatedAt: now });
    await ctx.scheduler.runAt(
      quote.expiresAt,
      internal.buyerExecution.expireQuote,
      { quoteId: String(id) },
    );
    return saveCommand(
      ctx,
      "selectAndReserve",
      args.clientKey,
      command.hash,
      command.user,
      quote,
    );
  },
});
export const approveAndExecute = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({
        request: contracts.Ref,
        quoteId: contracts.Ref.shape.id,
        quoteHash: z.string().min(1).max(128),
        clientKey: keySchema,
      })
      .parse(input);
    const req = await requestFor(ctx, args.request.id);
    const command = await replay(
      ctx,
      "approveAndExecute",
      args.clientKey,
      args,
    );
    if (command.prior) {
      const id = ctx.db.normalizeId(
        "buyerExecutions",
        command.prior.result.executionId,
      );
      const prior = id ? await ctx.db.get(id) : null;
      if (prior) return contracts.ExecutionView.parse(prior.data);
    }
    const quoteId = ctx.db.normalizeId("buyerQuotes", args.quoteId);
    const row = quoteId ? await ctx.db.get(quoteId) : null;
    if (
      !row ||
      row.ownerId !== req.ownerId ||
      row.requestId !== args.request.id
    )
      fail("FORBIDDEN", "Quote is unavailable.");
    const quote = contracts.FirmQuote.parse(row.data);
    if (
      quote.quoteHash !== args.quoteHash ||
      quote.request.version !== args.request.version ||
      req.version !== args.request.version ||
      req.activeRunId !== row.runId
    )
      fail("STALE_VERSION", "Approval must match the exact current quote.");
    const approved = await ctx.db
      .query("buyerApprovals")
      .withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
      .unique();
    if (approved) {
      const prior = await ctx.db.get(
        ctx.db.normalizeId("buyerExecutions", approved.executionId)!,
      );
      if (prior) return prior.data;
    }
    await enforceUnlocked(ctx, args.request.id);
    if (row.state !== "reserved" || quote.expiresAt <= Date.now())
      fail(
        "EXPIRED",
        "The three-minute quote expired. Select and review it again.",
      );
    const merchant = await requireMerchant(ctx, quote.merchantId);
    if (
      merchant.paused ||
      !merchant.enabled ||
      merchant.currentPolicyId !== quote.policy.id ||
      merchant.currentPolicyVersion !== quote.policy.version
    )
      fail("STALE_VERSION", "Seller policy changed. Review a renewed quote.");
    const current = await loadSnapshots(ctx, quote.merchantId);
    for (const line of quote.lines)
      if (
        !current.some(
          (s) =>
            s.listing.listing.id === line.listing.id &&
            s.listing.listing.version === line.listing.version,
        )
      )
        fail("STALE_VERSION", "Product configuration changed.");
    const frozenProducts = quote.lines.map((line) => {
      const s = current.find(
        (s) =>
          s.listing.listing.id === line.listing.id &&
          s.listing.listing.version === line.listing.version,
      )!;
      return {
        requestLineId: line.requestLineId,
        variantId: s.variant.id,
        title: s.variant.title,
        condition: s.listing.condition,
        quantity: line.quantity,
        attributes: s.variant.attributes,
        diagnostics: s.listing.diagnosticAttributes,
        syntheticProduct: s.variant.syntheticProduct,
      };
    });
    if ((await digest(frozenProducts)) !== (await digest(row.products)))
      fail("STALE_VERSION", "Product facts changed. Review a renewed quote.");
    await transitionStock(ctx, args.quoteId, "lock", Date.now());
    const executionId = await ctx.db.insert("buyerExecutions", {
      requestId: args.request.id,
      ownerId: req.ownerId,
      quoteId: args.quoteId,
      state: "pending",
      mode: quote.paymentMode,
      scenario: (await setting(ctx, "paymentScenario", "success")) as string,
      data: null,
      attemptCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const view = contracts.ExecutionView.parse({
      executionId: String(executionId),
      quoteId: args.quoteId,
      status: "pending",
      mode: quote.paymentMode,
      operation: quote.operation,
      providerReference: null,
      orderId: null,
      resultMessage: "Your approved simulation is processing.",
      nextAction: "wait",
    });
    await ctx.db.patch(executionId, { data: view });
    await ctx.db.patch(row._id, { state: "execution_locked" });
    await ctx.db.insert("buyerApprovals", {
      requestId: args.request.id,
      quoteId: args.quoteId,
      ownerId: req.ownerId,
      quoteHash: args.quoteHash,
      executionId: String(executionId),
      createdAt: Date.now(),
    });
    const run = await runFor(ctx, row.runId);
    if (run)
      await ctx.db.patch(run._id, {
        purchaseStage: "executing",
        updatedAt: Date.now(),
      });
    await ctx.scheduler.runAfter(0, internal.buyerExecution.executeAttempt, {
      executionId: String(executionId),
    });
    return saveCommand(
      ctx,
      "approveAndExecute",
      args.clientKey,
      command.hash,
      command.user,
      view,
    );
  },
});
