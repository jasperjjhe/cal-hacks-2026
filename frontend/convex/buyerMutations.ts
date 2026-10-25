import { buyerTiming } from "./buyer/timing.ts";
import { internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { start, cancel, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { z } from "zod";
import { contracts } from "../src/contracts/index.ts";
import { validateConfirmation } from "../src/backend/buyer/requests.ts";
import { validateLines, parseDraft } from "./buyer/validation.ts";
import {
  owner,
  requestFor,
  runFor,
  replay,
  saveCommand,
  fail,
  emit,
  enforceUnlocked,
  setting,
  keySchema,
} from "./buyer/core.ts";
import { releaseRequestHolds } from "./buyer/inventory.ts";

export const saveDraft = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = contracts.SaveDraftInput.parse(input);
    const user = await owner(ctx);
    const now = Date.now();
    let row;
    if (args.requestId === null) {
      if (args.expectedDraftVersion !== null)
        fail("INVALID_INPUT", "New drafts have no prior version.");
      const requests = await ctx.db
        .query("buyerRequests")
        .withIndex("by_owner", (q) => q.eq("ownerId", user))
        .order("desc")
        .take(100);
      let active = 0;
      for (const req of requests) {
        const run = req.activeRunId ? await runFor(ctx, req.activeRunId) : null;
        if (
          !run ||
          (!["complete", "declined"].includes(run.purchaseStage) &&
            !["results", "no_match", "failed", "cancelled"].includes(run.stage))
        )
          active++;
      }
      if (active >= 3)
        fail(
          "LIMIT_REACHED",
          "Finish or cancel an existing request before starting another.",
        );
      const id = await ctx.db.insert("buyerRequests", {
        ownerId: user,
        version: 0,
        draftVersion: 1,
        draft: null,
        activeRunId: null,
        createdAt: now,
        updatedAt: now,
      });
      row = (await ctx.db.get(id))!;
      row.draft = {
        requestId: String(id),
        draftVersion: 1,
        messages: [],
        interpretation: null,
        confirmedRequest: null,
        updatedAt: now,
      };
    } else {
      row = await requestFor(ctx, args.requestId);
      await enforceUnlocked(ctx, args.requestId);
      if (row.draftVersion !== args.expectedDraftVersion)
        fail("STALE_VERSION", "Your draft changed. Reload its latest version.");
      await invalidateRun(ctx, row.activeRunId);
      await releaseRequestHolds(ctx, args.requestId);
      row.draftVersion++;
    }
    const draft = parseDraft(row.draft);
    const result = contracts.DraftView.parse({
      ...draft,
      draftVersion: row.draftVersion,
      messages: [
        ...draft.messages,
        {
          id: crypto.randomUUID(),
          role: "buyer",
          text: args.message,
          createdAt: now,
        },
      ],
      interpretation: null,
      confirmedRequest: null,
      updatedAt: now,
    });
    await ctx.db.patch(row._id, {
      draft: result,
      draftVersion: result.draftVersion,
      activeRunId: null,
      updatedAt: now,
    });
    return result;
  },
});
export const confirmRequest = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = contracts.ConfirmRequestInput.parse(input);
    const req = await requestFor(ctx, args.requestId);
    await enforceUnlocked(ctx, args.requestId);
    if (req.draftVersion !== args.expectedDraftVersion)
      fail("STALE_VERSION", "Your brief changed before confirmation.");
    try {
      validateConfirmation(input, Date.now(), { validate: () => undefined });
    } catch {
      fail(
        "INVALID_INPUT",
        "Check your deadline, line IDs and separate target consent.",
      );
    }
    await validateLines(ctx, args.lines);
    args.lines.sort((a, b) => Number(b.role === "primary") - Number(a.role === "primary"));
    await invalidateRun(ctx, req.activeRunId);
    await releaseRequestHolds(ctx, args.requestId);
    const now = Date.now();
    const reference = { id: args.requestId, version: req.version + 1 };
    const draft = parseDraft(req.draft);
    const consent = args.shareTarget
      ? {
          amountCents: args.sharedTargetCents!,
          consentId: crypto.randomUUID(),
          consentedAt: now,
        }
      : null;
    const brief = contracts.ConfirmedBrief.parse({
      schemaVersion: 1,
      request: reference,
      currency: "USD",
      deliveryRegion: "US-CA-SAN_FRANCISCO",
      deliveryDeadline: args.deliveryDeadline,
      lines: args.lines,
      sharedTarget: consent,
    });
    const origins = (draft.interpretation?.origins ?? [])
      .filter((o) =>
        args.lines.some((l) =>
          l.requirements.some((r) => r.id === o.requirementId),
        ),
      )
      .map((o) => ({ ...o, buyerConfirmed: true }));
    const record = contracts.RequestVersion.parse({
      schemaVersion: 1,
      request: reference,
      ownerId: req.ownerId,
      createdAt: now,
      rawMessages: draft.messages.map(({ id, text }) => ({ id, text })),
      origins,
      privateMaximumCents: args.privateMaximumCents,
      confirmedAt: now,
      sort: args.sort,
      brief,
    });
    await ctx.db.insert("buyerRequestVersions", {
      requestId: args.requestId,
      version: reference.version,
      ownerId: req.ownerId,
      data: record,
    });
    await ctx.db.patch(req._id, {
      version: reference.version,
      draft: { ...draft, confirmedRequest: reference, updatedAt: now },
      activeRunId: null,
      updatedAt: now,
    });
    return reference;
  },
});
const startInput = z.strictObject({
  request: contracts.Ref,
  clientKey: keySchema,
});
export const startRun = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<{ runId: string }> => {
    const args = startInput.parse(input);
    const req = await requestFor(ctx, args.request.id);
    const command = await replay(ctx, "startRun", args.clientKey, args);
    if (command.prior) return command.prior.result;
    if (
      req.version !== args.request.version ||
      parseDraft(req.draft).confirmedRequest?.version !== args.request.version
    )
      fail("STALE_VERSION", "Confirm the current request before starting.");
    await enforceUnlocked(ctx, args.request.id);
    if (req.activeRunId) {
      const prior = await runFor(ctx, req.activeRunId);
      if (
        prior &&
        !["results", "no_match", "cancelled", "failed"].includes(prior.stage)
      )
        fail("LIMIT_REACHED", "This request already has an active run.");
      if (prior?.purchaseStage === "complete")
        fail("INVALID_INPUT", "This request already has a completed order.");
    }
    const now = Date.now();
    const recent = await ctx.db
      .query("buyerRuns")
      .withIndex("by_owner_started", (q) =>
        q.eq("ownerId", req.ownerId).gte("startedAt", now - 60000),
      )
      .take(6);
    if (recent.length >= 5)
      fail("LIMIT_REACHED", "Wait before starting another run.", true);
    const existing = await ctx.db
      .query("buyerRuns")
      .withIndex("by_owner_started", (q) => q.eq("ownerId", req.ownerId))
      .order("desc")
      .take(100);
    if (
      existing.filter(
        (r) =>
          !["results", "no_match", "cancelled", "failed"].includes(r.stage),
      ).length >= 3
    )
      fail("LIMIT_REACHED", "At most three requests can run at once.");
    await releaseRequestHolds(ctx, args.request.id);
    const config = {
      agents: await setting(
        ctx,
        "agents",
        process.env.BUYER_AGENT_MODE ?? "fixture",
      ),
      paymentScenario: await setting(ctx, "paymentScenario", "success"),
      revision: "buyer-council-v2",
      councilSchedule: Object.fromEntries(Object.entries(buyerTiming.councilEndMs).map(([phase, offset]) => [phase, now + offset])),
      maxCalls: 28,
      maxTools: 40,
    };
    const id = await ctx.db.insert("buyerRuns", {
      requestId: args.request.id,
      version: req.version,
      ownerId: req.ownerId,
      stage: "bidding",
      purchaseStage: "none",
      workflowId: null,
      config,
      startedAt: now,
      updatedAt: now,
      deadlineAt: now + buyerTiming.runMs,
      sequence: 0,
      partial: false,
      error: null,
      refillCount: 0,
      providerCalls: 0,
      toolCalls: 0,
    });
    await ctx.db.patch(req._id, { activeRunId: String(id), updatedAt: now });
    const workflowId = await start(
      ctx,
      internal.buyerWorkflow.runBuyer,
      { runId: String(id) },
      {
        onComplete: internal.buyerWorkflow.workflowFinished,
        context: { runId: String(id) },
      },
    );
    await ctx.db.patch(id, { workflowId });
    await ctx.scheduler.runAt(now + buyerTiming.runMs, internal.buyerWorkflow.timeout, {
      runId: String(id),
    });
    await emit(
      ctx,
      String(id),
      "started",
      "The confirmed brief is being checked by participating demo merchants.",
    );
    return saveCommand(
      ctx,
      "startRun",
      args.clientKey,
      command.hash,
      command.user,
      { runId: String(id) },
    );
  },
});
export const cancelRun = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({ request: contracts.Ref, runId: contracts.Ref.shape.id })
      .parse(input);
    const req = await requestFor(ctx, args.request.id);
    await enforceUnlocked(ctx, args.request.id);
    if (req.version !== args.request.version || req.activeRunId !== args.runId)
      fail("STALE_VERSION", "This is not the current run.");
    await invalidateRun(ctx, args.runId);
    await releaseRequestHolds(ctx, args.request.id);
    return null;
  },
});
export const reviseRequest = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const changes = z.strictObject({
      messages: contracts.DraftView.shape.messages,
      proposedLines: contracts.IntakeResult.shape.proposedLines,
      proposedDeadline: contracts.IntakeResult.shape.proposedDeadline,
      proposedPrivateMaximumCents:
        contracts.IntakeResult.shape.proposedPrivateMaximumCents,
      proposedSharedTargetCents:
        contracts.IntakeResult.shape.proposedSharedTargetCents,
      sort: z.enum(["best_fit", "cheapest", "soonest", "warranty"]),
    });
    const args = z
      .strictObject({ request: contracts.Ref, changes })
      .parse(input);
    const req = await requestFor(ctx, args.request.id);
    await enforceUnlocked(ctx, args.request.id);
    if (req.version !== args.request.version)
      fail("STALE_VERSION", "The request has changed.");
    await invalidateRun(ctx, req.activeRunId);
    await releaseRequestHolds(ctx, args.request.id);
    const draftVersion = req.draftVersion + 1;
    const draft = contracts.DraftView.parse({
      requestId: args.request.id,
      draftVersion,
      messages: args.changes.messages,
      confirmedRequest: null,
      updatedAt: Date.now(),
      interpretation: {
        expectedDraftVersion: draftVersion,
        proposedLines: args.changes.proposedLines,
        proposedDeadline: args.changes.proposedDeadline,
        proposedPrivateMaximumCents: args.changes.proposedPrivateMaximumCents,
        proposedSharedTargetCents: null,
        origins: [],
        clarificationQuestions: [],
        suggestedReplies: [],
        unresolvedFields: [],
      },
    });
    await ctx.db.patch(req._id, {
      draft,
      draftVersion,
      activeRunId: null,
      updatedAt: Date.now(),
    });
    return draft;
  },
});
export const setSort = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({
        request: contracts.Ref,
        runId: contracts.Ref.shape.id,
        sort: z.enum(["best_fit", "cheapest", "soonest", "warranty"]),
      })
      .parse(input);
    const req = await requestFor(ctx, args.request.id);
    if (req.version !== args.request.version || req.activeRunId !== args.runId)
      fail("STALE_VERSION", "Sort belongs to an old run.");
    const run = await runFor(ctx, args.runId);
    if (!run) fail("STALE_VERSION", "Run unavailable.");
    await ctx.db.patch(run._id, {
      config: { ...run.config, sort: args.sort },
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const toggleSaved = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({ requestId: contracts.Ref.shape.id, offer: contracts.Ref })
      .parse(input);
    const req = await requestFor(ctx, args.requestId);
    if (!req.activeRunId) fail("STALE_VERSION", "No active comparison.");
    const rows = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", req.activeRunId!).eq("effective", true),
      )
      .take(6);
    const selected = rows.find(
      (r) =>
        r.data.offer.id === args.offer.id &&
        r.data.offer.version === args.offer.version,
    );
    if (!selected) fail("FORBIDDEN", "Offer unavailable.");
    const prior = await ctx.db
      .query("buyerBookmarks")
      .withIndex("by_owner_offer", (q) =>
        q.eq("ownerId", req.ownerId).eq("offerId", args.offer.id),
      )
      .unique();
    if (prior) await ctx.db.delete(prior._id);
    else
      await ctx.db.insert("buyerBookmarks", {
        ownerId: req.ownerId,
        offerId: args.offer.id,
        requestId: args.requestId,
        runId: req.activeRunId,
        card: selected.card,
        createdAt: Date.now(),
      });
    return null;
  },
});
async function invalidateRun(
  ctx: Parameters<typeof releaseRequestHolds>[0],
  id: string | null,
) {
  if (!id) return;
  const run = await runFor(ctx, id);
  if (!run || run.stage === "cancelled") return;
  if (run.purchaseStage === "executing" || run.purchaseStage === "unknown")
    fail("EXECUTION_UNKNOWN", "Purchase is still being resolved.");
  await ctx.db.patch(run._id, { stage: "cancelled", updatedAt: Date.now() });
  for (const invitation of await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", String(run._id))).take(6))
    if (invitation.status !== "received") await ctx.db.patch(invitation._id, { status: "unavailable" });
  const jobs = await ctx.db
    .query("buyerJobs")
    .withIndex("by_run", (q) => q.eq("runId", id))
    .take(100);
  for (const job of jobs)
    if (!["completed", "failed"].includes(job.state)) {
      await ctx.db.patch(job._id, { state: "cancelled" });
      await ctx.scheduler.runAfter(0, internal.buyerJobs.cancelProvider, {
        jobId: String(job._id),
      });
    }
  if (run.workflowId)
    await cancel(ctx, components.workflow, run.workflowId as WorkflowId);
  await emit(
    ctx,
    id,
    "closed",
    "The run was cancelled. Old completions cannot change the current request.",
  );
}
// Checkout commands are implemented in their own transactional module.
export { selectAndReserve, approveAndExecute } from "./buyer/checkout.ts";

export const removeSaved = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({ bookmarkId: contracts.Ref.shape.id })
      .parse(input);
    const user = await owner(ctx);
    const id = ctx.db.normalizeId("buyerBookmarks", args.bookmarkId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.ownerId !== user)
      fail("FORBIDDEN", "Saved offer unavailable.");
    await ctx.db.delete(row._id);
    return null;
  },
});
