import { buyerTiming } from "./buyer/timing.ts";
import { computeHighlights, type HighlightInput } from "./buyer/highlights.ts";
import { merchantEligible } from "./buyer/eligibility";
import {
  cancel,
  type WorkflowId,
  WorkflowManager,
  vWorkflowId,
} from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { v } from "convex/values";
import { contracts } from "../src/contracts/index.ts";
import { currentRun, versionFor, emit } from "./buyer/core.ts";
import { councilFor } from "./buyerRoles.ts";
import { publiclyEligible, sameRef, councilPhases } from "./buyer/council.ts";
const workflow = new WorkflowManager(components.workflow);
export const runBuyer = workflow
  .define({ args: { runId: v.string() }, returns: v.null() })
  .handler(async (step, { runId }): Promise<null> => {
    async function phase(name: string, roundId?: string) {
      await step.runMutation(internal.buyerJobs.preparePhase, {
        runId,
        phase: name,
        ...(roundId ? { roundId } : {}),
      });
      const jobs = await step.runQuery(internal.buyerJobs.phaseJobs, {
        runId,
        phase: name,
      });
      const merchants = [...new Set(jobs.map((j) => j.merchantId))];
      await Promise.all(
        merchants.map(async (merchant) => {
          for (const job of jobs.filter((j) => j.merchantId === merchant)) {
            let status = await step.runAction(
              internal.buyerJobs.dispatch,
              { jobId: job.id },
              { retry: false },
            );
            for (let attempt = 0; status.pending && attempt < 40; attempt++) {
              await step.sleep(attempt < 1 ? 2000 : attempt < 2 ? 5000 : 10000);
              status = await step.runAction(
                internal.buyerJobs.dispatch,
                { jobId: job.id, poll: true },
                { retry: false },
              );
            }
          }
        }),
      );
    }
    await phase("bidding");
    let stage = await step.runMutation(internal.buyerWorkflow.closeBidding, {
      runId,
    });
    if (stage === "council") {
      const councilId = await step.runMutation(internal.buyerRoles.freezeCompetition, { runId });
      if (councilId) {
        for (const councilPhase of councilPhases) {
          await step.runMutation(internal.buyerRoles.prepareCouncilJobs, { runId, phase: councilPhase });
          const jobs = await step.runQuery(internal.buyerRoles.councilJobs, { runId, phase: councilPhase });
          await Promise.all(jobs.map(async job => {
            let status = await step.runAction(internal.buyerJobs.dispatch, { jobId: job.id }, { retry: false });
            for (let i = 0; status.pending && i < 40; i++) {
              await step.sleep(buyerTiming.pollMs);
              status = await step.runAction(internal.buyerJobs.dispatch, { jobId: job.id, poll: true }, { retry: false });
            }
          }));
          await step.runMutation(internal.buyerRoles.closeCouncilPhase, { runId, phase: councilPhase });
        }
      }
      stage = "negotiating";
    }
    if (stage === "negotiating") {
      const roundId = await step.runMutation(
        internal.buyerWorkflow.openPriceRound,
        { runId },
      );
      if (roundId) {
        await phase("negotiating", roundId);
        await step.runMutation(internal.buyerWorkflow.closePriceRound, {
          runId,
          roundId,
        });
      }
    }
    const research = await step.runMutation(
      internal.buyerEvidence.prepareResearch,
      { runId },
    );
    await Promise.all(
      research.map(async (id) => {
        let pending = await step.runAction(
          internal.buyerEvidence.acquire,
          { researchJobId: id },
          { retry: false },
        );
        for (let i = 0; pending && i < 8; i++) {
          await step.sleep(i === 0 ? 2000 : i === 1 ? 5000 : 10000);
          pending = await step.runAction(
            internal.buyerEvidence.acquire,
            { researchJobId: id, poll: true },
            { retry: false },
          );
        }
      }),
    );
    const refill = await step.runMutation(
      internal.buyerEvidence.refillResearch,
      { runId },
    );
    for (const id of refill) {
      let pending = await step.runAction(
        internal.buyerEvidence.acquire,
        { researchJobId: id },
        { retry: false },
      );
      for (let i = 0; pending && i < 6; i++) {
        await step.sleep(10000);
        pending = await step.runAction(
          internal.buyerEvidence.acquire,
          { researchJobId: id, poll: true },
          { retry: false },
        );
      }
    }
    const summaries = await step.runMutation(
      internal.buyerRoles.prepareSummaries,
      { runId },
    );
    await Promise.all(
      summaries.map(async (jobId) => {
        let status = await step.runAction(
          internal.buyerJobs.dispatch,
          { jobId },
          { retry: false },
        );
        for (let i = 0; status.pending && i < 6; i++) {
          await step.sleep(buyerTiming.pollMs);
          status = await step.runAction(
            internal.buyerJobs.dispatch,
            { jobId, poll: true },
            { retry: false },
          );
        }
      }),
    );
    await step.runMutation(internal.buyerWorkflow.publishResults, { runId });
    return null;
  });
export const closeBidding = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run = await currentRun(ctx, runId, "bidding");
    if (!run) return "closed";
    const offers = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", runId).eq("effective", true),
      )
      .take(6);
    if (!offers.length) {
      const jobs = await ctx.db
        .query("buyerJobs")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .take(30);
      const providerFailed = jobs.some((j) => j.state === "failed");
      await ctx.db.patch(run._id, {
        stage: providerFailed ? "failed" : "no_match",
        error: providerFailed
          ? {
              code: "PROVIDER_UNAVAILABLE",
              message:
                "No valid offers were returned because an agent was unavailable.",
              retryable: true,
              correlationId: runId,
            }
          : null,
        updatedAt: Date.now(),
      });
      await emit(
        ctx,
        runId,
        "closed",
        providerFailed
          ? "Provider work failed; no synthetic replacement was published."
          : "No current stock meets the confirmed product requirements.",
      );
      return "closed";
    }
    const merchants = new Set(offers.map((o) => o.merchantId)).size;
    const stage = merchants >= 2 ? "council" : "negotiating";
    await ctx.db.patch(run._id, { stage, updatedAt: Date.now() });
    return stage;
  },
});
export const openPriceRound = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<string | null> => {
    const run = await currentRun(ctx, runId, "negotiating");
    if (!run) return null;
    const prior = await ctx.db
      .query("buyerRounds")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .first();
    if (prior) return String(prior._id);
    const request = await versionFor(ctx, run.requestId, run.version);
    const council = await councilFor(ctx, runId);
    if (council && council.phase !== "closed") return null;
    const candidates = await ctx.db.query("buyerOffers")
      .withIndex("by_run_effective", q => q.eq("runId", runId).eq("effective", true)).take(6);
    const invitations = await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", runId)).take(6);
    const offers = [];
    for (const row of candidates) {
      if (council && !invitations.some(i => i.candidateId === row.candidateId && sameRef(i.openingOffer, row.data.offer))) continue;
      if (await publiclyEligible(ctx, row, request)) offers.push(row);
    }
    const merchantCount = new Set(offers.map(o => o.merchantId)).size;
    if (!offers.length || (!council && merchantCount < 2 && !request.brief.sharedTarget) || Date.now() + 1000 >= run.deadlineAt) {
      for (const invitation of invitations) await ctx.db.patch(invitation._id, { status: "unavailable" });
      await ctx.db.patch(run._id, { stage: "researching", partial: run.partial || !!council, updatedAt: Date.now() });
      await emit(ctx, runId, "price_round_skipped", "No eligible competitive or explicitly consented single-seller final work remains; prior valid offers are retained.");
      return null;
    }
    const id = await ctx.db.insert("buyerRounds", { runId, data: null });
    const round = contracts.PriceRound.parse({
      id: String(id),
      request: request.request,
      runId,
      councilId: council ? String(council._id) : null,
      snapshot: council?.snapshot.snapshot ?? null,
      snapshotDigest: council?.snapshotDigest ?? null,
      outcomeVersion: council?.outcomeVersion ?? 0,
      mode: council || merchantCount >= 2 ? "competitive" : "single_seller_target",
      participants: offers.map((o) => ({
        merchantId: o.merchantId,
        candidateId: o.candidateId,
        initialOffer: o.data.offer,
      })),
      openedAt: Date.now(),
      deadlineAt: Math.min(Date.now() + 30000, run.deadlineAt),
      status: "open",
      closeReason: null,
    });
    await ctx.db.patch(id, { data: round });
    for (const offer of offers) {
      const invitation = invitations.find(i => i.candidateId === offer.candidateId);
      if (invitation) await ctx.db.patch(invitation._id, { roundId: String(id), outcomeVersion: round.outcomeVersion, deadlineAt: round.deadlineAt, status: "invited" });
      else await ctx.db.insert("buyerFinalInvitations", { runId, councilId: round.councilId, roundId: String(id),
        candidateId: offer.candidateId, merchantId: offer.merchantId, openingOffer: offer.data.offer,
        snapshot: round.snapshot, snapshotDigest: round.snapshotDigest, outcomeVersion: round.outcomeVersion,
        deadlineAt: round.deadlineAt, status: "invited", jobId: null });
      await emit(ctx, runId, "final_invitation", "One sealed final decision invited; holding or abstaining is valid. Service concessions await seller authority integration.", offer.merchantId);
    }
    for (const invitation of invitations) if (!offers.some(o => o.candidateId === invitation.candidateId)) await ctx.db.patch(invitation._id, { status: "unavailable" });
    if (council && merchantCount < 2) await emit(ctx, runId, "council_phase_closed", "Participation changed after the shared snapshot; surviving candidates retain their final invitations, with no continuing two-merchant competition claim.");
    await emit(
      ctx,
      runId,
      "price_round_opened",
      merchantCount >= 2
        ? "One sealed final-price round opened for actual participating demo merchants."
        : "A single-seller target negotiation opened; this is not competition.",
    );
    return String(id);
  },
});
export const closePriceRound = internalMutation({
  args: { runId: v.string(), roundId: v.string() },
  handler: async (ctx, args) => {
    const run = await currentRun(ctx, args.runId, "negotiating");
    const id = ctx.db.normalizeId("buyerRounds", args.roundId);
    const row = id ? await ctx.db.get(id) : null;
    if (!run || !row || row.runId !== args.runId || row.data.status !== "open")
      return;
    const jobs = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run_phase", (q) =>
        q.eq("runId", args.runId).eq("phase", "negotiating"),
      )
      .take(6);
    if (
      Date.now() < row.data.deadlineAt &&
      jobs.some(
        (j) => !["completed", "failed", "stale", "cancelled"].includes(j.state),
      )
    )
      return;
    const submissions = await ctx.db
      .query("buyerSubmissions")
      .withIndex("by_round_candidate", (q) => q.eq("roundId", args.roundId))
      .take(6);
    for (const submission of submissions) {
      if (!submission.offerId) continue;
      const offerId = ctx.db.normalizeId("buyerOffers", submission.offerId);
      const offer = offerId ? await ctx.db.get(offerId) : null;
      if (!offer || offer.stagedRoundId !== args.roundId || offer.data.acceptedAt >= row.data.deadlineAt || !row.data.participants.some((p: { candidateId: string; merchantId: string }) => p.candidateId === offer.candidateId && p.merchantId === offer.merchantId) || !(await merchantEligible(ctx, offer.merchantId, offer.data.policy))) continue;
      const request = await versionFor(ctx, run.requestId, run.version);
      if (!(await publiclyEligible(ctx, offer, request))) continue;
      const before = await ctx.db
        .query("buyerOffers")
        .withIndex("by_run_candidate", (q) =>
          q.eq("runId", args.runId).eq("candidateId", offer.candidateId),
        )
        .take(20);
      for (const old of before)
        if (old.effective) await ctx.db.patch(old._id, { effective: false });
      await ctx.db.patch(offer._id, { effective: true, stagedRoundId: null });
      const candidate = await ctx.db
        .query("candidates")
        .withIndex("by_candidateId", (q) =>
          q.eq("candidateId", offer.candidateId),
        )
        .unique();
      if (candidate)
        await ctx.db.patch(candidate._id, {
          currentOfferId: offer.data.offer.id,
          currentOfferVersion: offer.data.offer.version,
          status: "accepted",
          updatedAt: Date.now(),
        });
      await emit(
        ctx,
        args.runId,
        "final_bid",
        "A validated final revision was published after sealed bidding closed.",
        offer.merchantId,
        offer.data.offer,
      );
    }
    const invitations = await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", args.runId)).take(6);
    let missing = 0;
    for (const invitation of invitations) {
      const submission = submissions.find(s => s.candidateId === invitation.candidateId);
      const validRevision = submission?.offerId ? await ctx.db.get(ctx.db.normalizeId("buyerOffers", submission.offerId)!) : null;
      const received = !!submission && (submission.decision !== "revise" || validRevision?.effective);
      if (!received) missing++;
      await ctx.db.patch(invitation._id, { status: received ? "received" : "unavailable" });
    }
    if (missing) await ctx.db.patch(run._id, { partial: true });
    await emit(ctx, args.runId, "final_round_closed", `Sealed final round closed; ${invitations.length - missing}/${invitations.length} valid decisions received. Missing/invalid finals retain only eligible earlier offers.`);
    await ctx.db.patch(row._id, {
      data: {
        ...row.data,
        status: "closed",
        closeReason:
          Date.now() >= row.data.deadlineAt ? "deadline" : "all_responded",
      },
    });
    await ctx.db.patch(run._id, {
      stage: "researching",
      updatedAt: Date.now(),
    });
  },
});
export const publishResults = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run = await currentRun(ctx, runId, "researching");
    if (!run) return;
    const rows = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", runId).eq("effective", true),
      )
      .take(6);
    let selectable = 0;
    const highlightInputs: HighlightInput[] = [];
    for (const row of rows) {
      const variantId = row.card.products[0].variantId as string;
      const variant = await ctx.db
        .query("variants")
        .withIndex("by_variantId", (q) => q.eq("variantId", variantId))
        .first();
      if (variant && row.data.policyValid && row.data.requirementsValidExceptBudget && row.data.affordable)
        highlightInputs.push({ variantId, totalCents: row.card.totalCents, attributes: variant.attributes });
    }
    const highlights = computeHighlights(highlightInputs);
    for (const row of rows) {
      const data = contracts.OfferVersion.parse(row.data);
      const card = contracts.OfferCard.parse(row.card);
      const merchant = await ctx.db
        .query("merchants")
        .withIndex("by_merchantId", (q) => q.eq("merchantId", row.merchantId))
        .unique();
      const valid =
        !!merchant &&
        merchant.enabled &&
        !merchant.paused &&
        merchant.currentPolicyId === data.policy.id &&
        merchant.currentPolicyVersion === data.policy.version &&
        data.policyValid &&
        data.requirementsValidExceptBudget &&
        data.affordable &&
        data.expiresAt > Date.now();
      if (valid) selectable++;
      await ctx.db.patch(row._id, {
        data: { ...data, selectable: valid },
        card: {
          ...card,
          evidenceStatus:
            card.evidenceStatus === "pending"
              ? "unavailable"
              : card.evidenceStatus,
          selectable: valid,
          highlights: highlights.get(card.products[0].variantId) ?? [],
          unavailableReason: valid
            ? null
            : !data.affordable
              ? "Above your private delivered ceiling."
              : "A required fact or delivery deadline is not met.",
        },
      });
    }
    await ctx.db.patch(run._id, {
      stage: selectable ? "results" : "no_match",
      partial: run.partial || rows.some((o) =>
        ["unavailable", "partial", "pending"].includes(o.card.evidenceStatus),
      ),
      updatedAt: Date.now(),
    });
    await emit(
      ctx,
      runId,
      "closed",
      selectable
        ? "Checked offers are ready. Product sources and remaining evidence gaps are shown separately."
        : "No final offer meets every confirmed requirement and your private delivered-price ceiling.",
    );
  },
});
export const workflowFinished = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.any() },
  handler: async (ctx, args) => {
    if (args.result.kind === "success") return;
    const run = await currentRun(ctx, args.context.runId);
    if (
      !run ||
      ["results", "no_match", "cancelled", "failed"].includes(run.stage)
    )
      return;
    const offers = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", String(run._id)).eq("effective", true),
      )
      .take(6);
    for (const invitation of await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", String(run._id))).take(6))
      if (invitation.status !== "received") await ctx.db.patch(invitation._id, { status: "unavailable" });
    if (offers.length) {
      await ctx.db.patch(run._id, { stage: "researching", partial: true });
      await ctx.runMutation(internal.buyerWorkflow.publishResults, {
        runId: String(run._id),
      });
    } else
      await ctx.db.patch(run._id, {
        stage: "failed",
        updatedAt: Date.now(),
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The run stopped before any valid offers were available.",
          retryable: true,
          correlationId: String(run._id),
        },
      });
  },
});

export const timeout = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run = await currentRun(ctx, runId);
    if (
      !run ||
      ["results", "no_match", "cancelled", "failed"].includes(run.stage) ||
      run.deadlineAt > Date.now()
    )
      return;
    if (run.workflowId)
      await cancel(ctx, components.workflow, run.workflowId as WorkflowId);
    const jobs = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .take(100);
    for (const job of jobs)
      if (!["completed", "failed", "stale", "cancelled"].includes(job.state)) {
        await ctx.db.patch(job._id, { state: "stale" });
        await ctx.scheduler.runAfter(0, internal.buyerJobs.cancelProvider, {
          jobId: String(job._id),
        });
      }
    for (const invitation of await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", runId)).take(6))
      if (invitation.status !== "received") await ctx.db.patch(invitation._id, { status: "unavailable" });
    const rows = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", runId).eq("effective", true),
      )
      .take(6);
    for (const row of rows)
      if (row.card.evidenceStatus === "pending")
        await ctx.db.patch(row._id, {
          card: { ...row.card, evidenceStatus: "unavailable" },
        });
    await ctx.db.patch(run._id, {
      stage: "researching",
      partial: true,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.buyerWorkflow.publishResults, { runId });
  },
});
