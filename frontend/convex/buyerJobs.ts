import { buyerTiming } from "./buyer/timing.ts";
import { activeCouncilJob, completeCouncilOutput, councilFor } from "./buyerRoles.ts";
import { fixtureCouncil, publiclyEligible, publicOffer, sameRef } from "./buyer/council.ts";
import { merchantEligible } from "./buyer/eligibility";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { z } from "zod";
import { contracts, type Contract } from "../src/contracts/index.ts";
type ContractOffer = Contract<"OfferVersion">;
function canonicalFinalBinding(value: Record<string, unknown>) {
  return JSON.stringify([value.schemaVersion, value.jobId, value.roundId, value.councilId, value.snapshot, value.snapshotDigest, value.outcomeVersion, value.candidateId]);
}
import { buildSellerBrief } from "../src/backend/buyer/requests.ts";
import {
  currentRun,
  versionFor,
  requestFor,
  digest,
  fail,
  emit,
  arrivalAt,
} from "./buyer/core.ts";
import { snapshotCreaoConfig } from "./integrations/creaoBuyer.ts";
import { fixtureIntake } from "./buyer/intake.ts";
import { loadSnapshots, getPolicy, toPolicy } from "./sellerInternal.ts";
import { assessLine, minimumUnitCents } from "./lib/sellerValidation.ts";
import { projectOffer } from "./buyer/projection.ts";
import {
  invokeCreao,
  pollCreao,
  cancelCreao,
} from "./integrations/buyerTools.ts";
import type {
  SellerProposal,
  SellerDecision,
  OfferVersion as SellerOffer,
} from "./lib/sellerContracts.ts";
export const prepareIntake = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => {
    const args = z
      .strictObject({
        requestId: contracts.Ref.shape.id,
        expectedDraftVersion: z.int().positive(),
      })
      .parse(input);
    const req = await requestFor(ctx, args.requestId);
    if (req.draftVersion !== args.expectedDraftVersion)
      fail("STALE_VERSION", "Your draft changed.");
    const draft = contracts.DraftView.parse(req.draft);
    const prior = await ctx.db
      .query("buyerJobs")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .filter((q) =>
        q.and(
          q.eq(q.field("role"), "intake"),
          q.eq(q.field("version"), args.expectedDraftVersion),
        ),
      )
      .first();
    if (prior) return String(prior._id);
    if (draft.messages.filter((m) => m.role === "assistant").length >= 3)
      fail(
        "LIMIT_REACHED",
        "Review the editable brief after three clarification turns.",
      );
    const profiles = (await ctx.db.query("categoryProfiles").take(100)).map(r => contracts.CategoryProfile.parse({
      profile: { id: r.profileId, version: r.version }, category: r.category, allowedConditions: r.allowedConditions,
      fields: r.fields, variantKeyFields: r.variantKeyFields, compatibilityRuleId: r.compatibilityRuleId, evidenceRuleId: r.evidenceRuleId,
    }));
    const inputData = { draft, profiles };
    return String(
      await ctx.db.insert("buyerJobs", {
        runId: null,
        requestId: args.requestId,
        version: req.draftVersion,
        phase: "intake",
        role: "intake",
        merchantId: null,
        candidateId: null,
        sellerJobId: null,
        state: "queued",
        input: inputData,
        inputDigest: await digest(inputData),
        provider: process.env.BUYER_AGENT_MODE === "live" ? "creao" : "fixture",
        providerConfig: snapshotCreaoConfig("intake"),
        providerRunId: null,
        outputDigest: null,
        output: null,
        deadlineAt: Date.now() + buyerTiming.creaoMs,
        createdAt: Date.now(),
        completedAt: null,
      }),
    );
  },
});
export const preparePhase = internalMutation({
  args: {
    runId: v.string(),
    phase: v.string(),
    roundId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const run = await currentRun(ctx, args.runId, args.phase);
    if (!run || Date.now() >= run.deadlineAt) return [];
    const existing = (
      await ctx.db
        .query("buyerJobs")
        .withIndex("by_run_phase", (q) =>
          q.eq("runId", args.runId).eq("phase", args.phase),
        )
        .take(10)
    ).filter((j) => j.role.startsWith("seller_") && !j.input.repairAttempt);
    if (existing.length) return existing.map((j) => String(j._id));
    const request = await versionFor(ctx, run.requestId, run.version);
    const brief = buildSellerBrief(request, args.runId);
    const now = Date.now();
    const ids: string[] = [];
    if (args.phase === "bidding") {
      const merchants = await ctx.db
        .query("merchants")
        .withIndex("by_enabled_paused", (q) =>
          q.eq("enabled", true).eq("paused", false),
        )
        .take(3);
      for (const merchant of merchants) {
        if (!merchant.currentPolicyId) continue;
        const snapshots = await loadSnapshots(ctx, merchant.merchantId);
        const policy = toPolicy(
          await getPolicy(ctx, {
            id: merchant.currentPolicyId,
            version: merchant.currentPolicyVersion,
          }),
        );
        const options = snapshots.filter(
          (s) =>
            s.variant.category ===
            brief.lines.find((l) => l.role === "primary")?.category,
        );
        const sorted = options
          .map((s) => ({
            s,
            valid: assessLine(brief.lines.find((l) => l.role === "primary")!, s)
              .hardRequirementsPassed,
          }))
          .sort(
            (a, b) =>
              Number(b.valid) - Number(a.valid) ||
              a.s.listing.referenceUnitCents - b.s.listing.referenceUnitCents,
          );
        const chosen = sorted.filter((s) => s.valid).slice(0, 2);
        if (!chosen.length) continue;
        for (let i = 0; i < chosen.length; i++) {
          const candidateId = `${args.runId}:${merchant.merchantId}:c${i + 1}`;
          const sellerJobId = `${args.runId}:${merchant.merchantId}:j${i + 1}`;
          const payload = {
            brief,
            policy,
            snapshots,
            candidateId,
            sellerJobId,
            preferredListingId: chosen[i].s.listing.listing.id,
            roundId: null,
          };
          const inputDigest = await digest(payload);
          const inputRef = `${sellerJobId}:input`;
          await ctx.runMutation(internal.sellerInternal.prepareSellerJob, {
            jobId: sellerJobId,
            requestId: run.requestId,
            requestVersion: run.version,
            runId: args.runId,
            phaseId: args.phase,
            merchantId: merchant.merchantId,
            candidateIds: [candidateId],
            policy: policy.policy,
            profileVersions: Object.fromEntries(
              brief.lines.map((l) => [l.profile.id, l.profile.version]),
            ),
            role: "seller_initial",
            provider: "fixture", // Seller live dispatch is connected during branch consolidation.
            providerConfigRevision: run.config.revision,
            inputDigest,
            inputRef,
            deadlineAt: Math.min(run.deadlineAt, run.config.councilSchedule?.bidding ?? run.startedAt + buyerTiming.councilEndMs.bidding),
          });
          ids.push(
            String(
              await ctx.db.insert("buyerJobs", {
                runId: args.runId,
                requestId: run.requestId,
                version: run.version,
                phase: args.phase,
                role: "seller_initial",
                merchantId: merchant.merchantId,
                candidateId,
                sellerJobId,
                state: "queued",
                input: payload,
                inputDigest,
                provider: "fixture", // Seller live dispatch is connected during branch consolidation.
                providerRunId: null,
                outputDigest: null,
                output: null,
                deadlineAt: Math.min(run.deadlineAt, run.config.councilSchedule?.bidding ?? run.startedAt + buyerTiming.councilEndMs.bidding),
                createdAt: now,
                completedAt: null,
              }),
            ),
          );
        }
      }
    } else if (args.phase === "negotiating") {
      const rows = await ctx.db
        .query("buyerOffers")
        .withIndex("by_run_effective", (q) =>
          q.eq("runId", args.runId).eq("effective", true),
        )
        .take(6);
      const council = await councilFor(ctx, args.runId);
      const invitations = await ctx.db.query("buyerFinalInvitations").withIndex("by_run", q => q.eq("runId", args.runId)).take(6);
      const selected = council ? rows.filter(row => invitations.some(i => i.candidateId === row.candidateId && sameRef(i.openingOffer, row.data.offer))) : rows;
      for (const row of selected) {
        if (!(await publiclyEligible(ctx, row, request))) continue;
        const roundId = args.roundId ? ctx.db.normalizeId("buyerRounds", args.roundId) : null;
        const round = roundId ? await ctx.db.get(roundId) : null;
        if (args.phase === "negotiating" && (!round || round.runId !== args.runId || round.data.status !== "open" || round.data.deadlineAt <= now || !round.data.participants.some((p: { candidateId: string }) => p.candidateId === row.candidateId))) continue;
        const snapshots = await loadSnapshots(ctx, row.merchantId);
        const policy = toPolicy(await getPolicy(ctx, row.data.policy));
        const sellerJobId = row.snapshot.sellerJobId as string;
        const jobs = await ctx.db
          .query("sellerJobs")
          .withIndex("by_jobId", (q) => q.eq("jobId", sellerJobId))
          .unique();
        if (!jobs) continue;
        const deadlineAt = Math.min(
          run.deadlineAt,
          round!.data.deadlineAt,
        );
        await ctx.db.patch(jobs._id, {
          role: "seller_final",
          phaseId: args.phase,
          deadlineAt,
          status: "created",
          updatedAt: now,
        });
        const payload = {
          brief,
          policy,
          snapshots,
          candidateId: row.candidateId,
          sellerJobId,
          parentOffer: {
            offer: row.data.offer,
            candidateId: row.candidateId,
            merchantId: row.merchantId,
            policy: row.data.policy,
            lines: row.data.lines,
            claims: row.data.claims,
            totalCents: row.data.totalCents,
            shippingCents: row.data.shippingCents,
            arrivalAt: row.data.arrivalAt,
            warrantyMonths: row.data.warrantyMonths,
            returnDays: row.data.returnDays,
          },
          roundId: args.roundId ?? null,
          competition: council?.snapshot ?? null,
          comparisons: council?.comparisons.filter((c: {merchantId:string}) => c.merchantId === row.merchantId) ?? [],
          checkedOutcomes: council?.outcomes ?? [],
          finalBinding: { schemaVersion: 2, jobId: sellerJobId, roundId: args.roundId!,
            councilId: council ? String(council._id) : null, snapshot: council?.snapshot.snapshot ?? null,
            snapshotDigest: council?.snapshotDigest ?? null, outcomeVersion: council?.outcomeVersion ?? 0,
            candidateId: row.candidateId },
          feedback: "Use the frozen public comparison and checked outcomes. Hold, abstain, or improve within the existing policy; never substitute goods or weaken terms.",
        };
        const sellerInput = contracts.SellerFinalJobInput.parse({ ...payload.finalBinding,
          merchantId: row.merchantId, policy: row.data.policy, request: request.request, runId: args.runId,
          deadlineAt, brief: council?.snapshot.brief ?? {
            schemaVersion: brief.schemaVersion, request: brief.request, currency: brief.currency, deliveryRegion: brief.deliveryRegion,
            deliveryDeadline: brief.deliveryDeadline, lines: brief.lines, sharedTarget: brief.sharedTarget,
          }, ownOffer: await publicOffer(ctx, row, request),
          competition: council?.snapshot ?? null, facts: council?.facts ?? [],
          comparisons: council?.comparisons.find((c: {merchantId:string}) => c.merchantId === row.merchantId)?.points ?? [],
          outcomes: council?.outcomes ?? [] });
        // Only this canonical projection may cross the future seller provider port.
        const finalPayload = { ...payload, sellerInput };
        ids.push(
          String(
            await ctx.db.insert("buyerJobs", {
              runId: args.runId,
              requestId: run.requestId,
              version: run.version,
              phase: args.phase,
              role: "seller_final",
              merchantId: row.merchantId,
              candidateId: row.candidateId,
              sellerJobId,
              state: "queued",
              input: finalPayload,
              inputDigest: await digest(finalPayload),
              provider: "fixture", // Seller live dispatch is connected during branch consolidation.
              providerRunId: null,
              outputDigest: null,
              output: null,
              deadlineAt,
              createdAt: now,
              completedAt: null,
            }),
          ),
        );
        const invitation = invitations.find(i => i.candidateId === row.candidateId);
        if (invitation) await ctx.db.patch(invitation._id, { jobId: ids[ids.length - 1], status: "invited" });
      }
    }
    return ids;
  },
});
export const claimJob = internalMutation({
  args: { jobId: v.string(), poll: v.boolean() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerJobs", args.jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (!job) return null;
    if (job.runId && !(await currentRun(ctx, job.runId, job.phase)))
      return null;
    if (!(await activeCouncilJob(ctx, job))) {
      await ctx.db.patch(job._id, { state: "stale", completedAt: Date.now() });
      return null;
    }
    if (!args.poll && job.merchantId && job.phase !== "council" && !(await merchantEligible(ctx, job.merchantId, job.input.policy.policy))) {
      await ctx.db.patch(job._id, { state: "cancelled", completedAt: Date.now() });
      return null;
    }
    if (Date.now() >= job.deadlineAt) {
      if (job.provider === "creao" && job.providerRunId) await ctx.scheduler.runAfter(0, internal.buyerJobs.cancelProvider, { jobId: args.jobId });
      await ctx.db.patch(job._id, { state: "failed" });
      return null;
    }
    if (args.poll ? job.state !== "pending" : job.state !== "queued")
      return null;
    if (job.runId) {
      const run = await currentRun(ctx, job.runId, job.phase);
      if (
        !run ||
        (!args.poll && run.providerCalls >= run.config.maxCalls) ||
        run.toolCalls >= run.config.maxTools
      ) {
        await ctx.db.patch(job._id, {
          state: "failed",
          completedAt: Date.now(),
        });
        return null;
      }
      if (!args.poll && job.role === "seller_initial") {
        const peers = await ctx.db
          .query("buyerJobs")
          .withIndex("by_run_phase", (q) =>
            q.eq("runId", job.runId!).eq("phase", "bidding"),
          )
          .take(20);
        if (
          peers.filter(
            (p) =>
              p.merchantId === job.merchantId &&
              p.role === "seller_initial" &&
              p.state !== "queued",
          ).length >= 3
        ) {
          await ctx.db.patch(job._id, {
            state: "failed",
            completedAt: Date.now(),
          });
          return null;
        }
      }
      await ctx.db.patch(run._id, {
        providerCalls: run.providerCalls + (args.poll ? 0 : 1),
        toolCalls: run.toolCalls + 1,
      });
    }
    await ctx.db.patch(job._id, { state: args.poll ? "polling" : "starting" });
    return job;
  },
});
export const dispatch = internalAction({
  args: { jobId: v.string(), poll: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ pending: boolean }> => {
    const existing = await ctx.runQuery(internal.buyerJobs.getJob, {
      jobId: args.jobId,
    });
    if (existing?.state === "repairing" && existing.output?.repairJobId) {
      const status = await ctx.runAction(internal.buyerJobs.dispatch, {
        jobId: existing.output.repairJobId,
        poll: args.poll ?? false,
      });
      if (!status.pending)
        await ctx.runMutation(internal.buyerJobs.finishRepair, {
          jobId: args.jobId,
        });
      return status;
    }
    const job = await ctx.runMutation(internal.buyerJobs.claimJob, {
      jobId: args.jobId,
      poll: args.poll ?? false,
    });
    if (!job) return { pending: false };
    let result;
    try {
      if (job.provider === "fixture")
        result = {
          status: "completed" as const,
          providerRunId: `fixture:${args.jobId}`,
          model: "deterministic-fixture-v1",
          output:
            job.phase === "council" && job.input.schemaVersion === 2
              ? fixtureCouncil(job.input)
              : job.role === "intake"
              ? fixtureIntake(contracts.DraftView.parse(job.input.draft))
              : job.role === "evidence_summary"
                  ? fixtureSummary(job.input)
                  : fixtureSellerResult(job.input, job.phase),
        };
      else
        result = await (args.poll ? pollCreao : invokeCreao)({
          id: args.jobId,
          role: job.role,
          input: job.input,
          providerRunId: job.providerRunId,
          deadlineAt: job.deadlineAt,
          config: job.providerConfig ?? null,
        });
    } catch {
      await ctx.runMutation(internal.buyerJobs.markAmbiguous, { jobId: args.jobId });
      return { pending: true };
    }
    try {
      return await ctx.runMutation(internal.buyerJobs.completeJob, {
        jobId: args.jobId,
        result,
      });
    } catch {
      const repair = await ctx.runMutation(internal.buyerJobs.createRepair, {
        jobId: args.jobId,
      });
      if (repair) {
        const status = await ctx.runAction(internal.buyerJobs.dispatch, {
          jobId: repair,
        });
        if (!status.pending)
          await ctx.runMutation(internal.buyerJobs.finishRepair, {
            jobId: args.jobId,
          });
        return status;
      }
      await ctx.runMutation(internal.buyerJobs.failJob, { jobId: args.jobId });
      return { pending: false };
    }
  },
});
export const completeJob = internalMutation({
  args: { jobId: v.string(), result: v.any() },
  handler: async (ctx, args): Promise<{ pending: boolean }> => {
    const id = ctx.db.normalizeId("buyerJobs", args.jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (
      job?.state === "completed" &&
      job.outputDigest &&
      args.result?.status === "completed"
    ) {
      if ((await digest(args.result.output)) !== job.outputDigest)
        fail("INVALID_INPUT", "Mismatched provider replay.");
      return { pending: false };
    }
    if (!job || !["starting", "polling", "pending"].includes(job.state))
      return { pending: false };
    if (
      (job.runId && !(await currentRun(ctx, job.runId, job.phase))) ||
      Date.now() >= job.deadlineAt
    ) {
      await ctx.db.patch(job._id, { state: "stale" });
      return { pending: false };
    }
    if (job.phase === "negotiating") {
      const roundId = ctx.db.normalizeId("buyerRounds", job.input.roundId);
      const round = roundId ? await ctx.db.get(roundId) : null;
      if (!round || round.runId !== job.runId || round.data.status !== "open" || Date.now() >= round.data.deadlineAt || !round.data.participants.some((p: { candidateId: string; merchantId: string }) => p.candidateId === job.candidateId && p.merchantId === job.merchantId)) {
        await ctx.db.patch(job._id, { state: "stale", completedAt: Date.now() });
        return { pending: false };
      }
    }
    const result = z
      .discriminatedUnion("status", [
        z.object({
          status: z.literal("pending"),
          providerRunId: z.string().min(1).max(256),
        }),
        z.object({
          status: z.literal("completed"),
          providerRunId: z.string().min(1).max(256),
          model: z.string().nullable(),
          output: z.unknown(),
        }),
        z.object({
          status: z.literal("failed"),
          providerRunId: z.string().nullable(),
        }),
      ])
      .parse(args.result);
    if (job.providerRunId && result.providerRunId !== job.providerRunId)
      fail("INVALID_INPUT", "Provider job reference mismatch.");
    if (result.status === "pending") {
      await ctx.db.patch(job._id, {
        state: "pending",
        providerRunId: result.providerRunId,
      });
      return { pending: true };
    }
    if (result.status === "failed") {
      if (!job.input.repairAttempt)
        throw new Error("One bounded transient retry is permitted.");
      await ctx.db.patch(job._id, { state: "failed", completedAt: Date.now() });
      return { pending: false };
    }
    const hash = await digest(result.output);
    if (job.outputDigest) {
      if (job.outputDigest !== hash)
        fail("INVALID_INPUT", "Mismatched provider replay.");
      return { pending: false };
    }
    if (job.role === "intake") {
      const reqId = ctx.db.normalizeId("buyerRequests", job.requestId);
      const req = reqId ? await ctx.db.get(reqId) : null;
      if (!req || req.draftVersion !== job.version) {
        await ctx.db.patch(job._id, { state: "stale" });
        return { pending: false };
      }
      const output = contracts.IntakeResult.parse(result.output);
      if (
        output.expectedDraftVersion !== job.version ||
        output.origins.some((o) => o.buyerConfirmed)
      )
        fail("INVALID_INPUT", "Invalid intake provenance.");
      const draft = contracts.DraftView.parse(req.draft);
      for (const origin of output.origins) {
        const message = draft.messages.find(
          (m) => m.id === origin.messageId && m.role === "buyer",
        );
        if (
          !message ||
          origin.end < origin.start ||
          origin.end > message.text.length
        )
          fail("INVALID_INPUT", "Invalid source span.");
      }
      const text = output.clarificationQuestions.length
        ? output.clarificationQuestions.join(" ")
        : "Your proposed brief is ready. Review and explicitly confirm it before merchants begin.";
      const next = contracts.DraftView.parse({
        ...draft,
        interpretation: output,
        messages: [
          ...draft.messages,
          {
            id: `assistant:${args.jobId}`,
            role: "assistant",
            text,
            createdAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      });
      await ctx.db.patch(req._id, { draft: next, updatedAt: Date.now() });
    } else if (job.phase === "council" && job.input.schemaVersion === 2) {
      await completeCouncilOutput(ctx, job, result.output);
    } else if (job.role === "evidence_summary" && job.runId) {
      const summary = contracts.EvidenceSummary.parse(result.output);
      if (
        summary.variantId !== job.input.variantId ||
        [...summary.positives, ...summary.concerns].some(
          (c) =>
            !c.evidenceIds.length ||
            c.evidenceIds.some(
              (id) =>
                !job.input.evidence.some((e: { id: string }) => e.id === id),
            ),
        )
      )
        fail("INVALID_INPUT", "Unattributed evidence summary.");
      const offers = await ctx.db
        .query("buyerOffers")
        .withIndex("by_run_effective", (q) =>
          q.eq("runId", job.runId!).eq("effective", true),
        )
        .take(6);
      for (const offer of offers)
        if (offer.card.products[0].variantId === summary.variantId)
          await ctx.db.patch(offer._id, {
            card: {
              ...offer.card,
              mainConcern:
                summary.concerns[0]?.text ??
                summary.gaps[0] ??
                "Review the cited source applicability.",
            },
          });
    } else if (job.runId) {
      const request = await versionFor(ctx, job.requestId, job.version);
      let decision = result.output as SellerDecision;
      if (job.phase === "negotiating") {
        const openings = await ctx.db.query("buyerOffers").withIndex("by_run_candidate", q => q.eq("runId", job.runId!).eq("candidateId", job.candidateId!)).take(20);
        const opening = openings.find(row => row.effective && sameRef(row.data.offer, job.input.parentOffer.offer));
        if (!opening || !(await publiclyEligible(ctx, opening, request))) fail("POLICY_REJECTED", "Frozen opening offer is no longer eligible.");
        const final = contracts.SellerFinalDecision.parse(result.output);
        if (canonicalFinalBinding(final) !== canonicalFinalBinding(job.input.finalBinding))
          fail("STALE_VERSION", "Final submission binding mismatch.");
        if (final.decision.kind === "propose") {
          if (final.decision.proposal.serviceOptionId !== null) fail("POLICY_REJECTED", "Service-option authority awaits seller integration; pricing-only finals are supported.");
          const proposal = final.decision.proposal;
          const parent = job.input.parentOffer as ContractOffer;
          if (!proposal.parentOffer || !sameRef(proposal.parentOffer, parent.offer) ||
              proposal.candidateId !== job.candidateId || proposal.jobId !== job.sellerJobId ||
              proposal.lines.length !== parent.lines.length || proposal.lines.some(line => !parent.lines.some(p =>
                p.requestLineId === line.requestLineId && sameRef(p.listing, line.listing) && p.quantity === line.quantity)))
            fail("POLICY_REJECTED", "Final goods, quantities and parent must remain frozen.");
          decision = { kind: "propose", proposal: { schemaVersion: 1, jobId: proposal.jobId, candidateId: proposal.candidateId,
            parentOffer: proposal.parentOffer, policy: proposal.policy, lines: proposal.lines, claims: proposal.claims,
            fitArgument: proposal.fitArgument, privatePriceRationale: proposal.privatePriceRationale } };
        } else {
          decision = final.decision;
          if (decision.jobId !== job.sellerJobId || (decision.kind === "hold" && !sameRef(decision.offer, job.input.parentOffer.offer)))
            fail("POLICY_REJECTED", "Final hold/abstention identity mismatch.");
        }
      }
      // Only the seller validator may accept prices, stock or product fit.
      const accepted = await ctx.runMutation(
        internal.sellerInternal.validateAndStoreProposal,
        {
          jobId: job.sellerJobId!,
          brief: job.input.brief,
          decision,
          mode: job.provider === "fixture" ? "fixture" : "live",
          deferPromotion: job.phase === "negotiating",
        },
      );
      if (!accepted.ok) {
        if (!job.input.repairAttempt) throw new Error("Proposal requires one bounded repair.");
        await ctx.db.patch(job._id, { state: "failed", completedAt: Date.now() });
        return { pending: false };
      }
      if (
        accepted.ok &&
        "offer" in accepted &&
        accepted.offer &&
        accepted.outcome === "accepted"
      ) {
        const ref = accepted.offer;
        const raw = await ctx.db
          .query("offerVersions")
          .withIndex("by_offerId_and_version", (q) =>
            q.eq("offerId", ref.id).eq("version", ref.version),
          )
          .unique();
        if (raw) {
          const snapshots = await loadSnapshots(ctx, raw.merchantId);
          const before = await ctx.db
            .query("buyerOffers")
            .withIndex("by_run_candidate", (q) =>
              q.eq("runId", job.runId!).eq("candidateId", job.candidateId!),
            )
            .take(20);
          if (
            job.phase === "negotiating" &&
            before.some(
              (b) =>
                b.effective &&
                (raw.totalCents > b.data.totalCents ||
                  raw.shippingCents > b.data.shippingCents ||
                  arrivalAt(raw.createdAt, raw.arrivalCalendarDays) > b.data.arrivalAt ||
                  raw.warrantyMonths < b.data.warrantyMonths ||
                  raw.returnDays < b.data.returnDays ||
                  raw.arrivalCalendarDays > b.snapshot.arrivalCalendarDays),
            )
          )
            fail(
              "POLICY_REJECTED",
              "Final revision weakened the current offer.",
            );
          const rawOffer: SellerOffer = {
            ...raw,
            schemaVersion: 1,
            offer: ref,
            fit: {
              ...raw.fit,
              reasons: [],
              requirements: raw.fit.requirements.map((r) => ({
                ...r,
                weight: r.weight === 2 ? (2 as const) : (1 as const),
              })),
            },
          };
          const initial = before.length
            ? before[0].card.initialTotalCents
            : raw.totalCents;
          const projected = projectOffer({
            raw: rawOffer,
            offer: ref,
            request,
            runId: job.runId,
            products: snapshots,
            initialTotal: initial,
            argument: raw.fit.hardRequirementsPassed
              ? "Validated against your confirmed requirements; merchant terms are fictional demo inputs."
              : "This offer needs a requirement correction.",
          });
          const staged = job.phase === "negotiating";
          if (!staged)
            for (const previous of before)
              if (previous.effective)
                await ctx.db.patch(previous._id, { effective: false });
          const offerId = await ctx.db.insert("buyerOffers", {
            runId: job.runId,
            candidateId: job.candidateId!,
            merchantId: raw.merchantId,
            effective: !staged,
            stagedRoundId: job.input.roundId ?? null,
            ...projected,
            snapshot: {
              sellerJobId: job.sellerJobId,
              arrivalCalendarDays: raw.arrivalCalendarDays,
            },
          });
          if (staged) {
            const prior = await ctx.db
              .query("buyerSubmissions")
              .withIndex("by_round_candidate", (q) =>
                q
                  .eq("roundId", job.input.roundId)
                  .eq("candidateId", job.candidateId!),
              )
              .unique();
            if (prior && prior.digest !== hash)
              fail("INVALID_INPUT", "Final bid already submitted.");
            if (!prior)
              await ctx.db.insert("buyerSubmissions", {
                roundId: job.input.roundId,
                candidateId: job.candidateId!,
                digest: hash,
                offerId: String(offerId),
                decision: "revise",
              });
          } else
            await emit(
              ctx,
              job.runId,
              job.phase === "council" ? "revision" : "proposal",
              job.phase === "council"
                ? "A checked offer correction was recorded."
                : "A policy-valid sample offer was received.",
              raw.merchantId,
              ref,
            );
        }
      } else if (job.runId) {
        if (job.phase === "negotiating" && job.input.roundId) {
          const prior = await ctx.db
            .query("buyerSubmissions")
            .withIndex("by_round_candidate", (q) =>
              q
                .eq("roundId", job.input.roundId)
                .eq("candidateId", job.candidateId!),
            )
            .unique();
          if (!prior)
            await ctx.db.insert("buyerSubmissions", {
              roundId: job.input.roundId,
              candidateId: job.candidateId!,
              digest: hash,
              offerId: null,
              decision: decision.kind === "abstain" ? "abstain" : "hold",
            });
        }
        await emit(
          ctx,
          job.runId,
          decision.kind === "abstain"
            ? "abstained"
            : accepted.ok
              ? "response"
              : "rejected",
          accepted.ok
            ? "The merchant held its current terms or abstained."
            : "A proposal failed deterministic checks; no private buyer values were shared.",
          job.merchantId,
        );
      }
    }
    if (job.phase === "negotiating" && job.runId) {
      const invitation = await ctx.db.query("buyerFinalInvitations").withIndex("by_round_candidate", q => q.eq("roundId", job.input.roundId).eq("candidateId", job.candidateId!)).unique();
      if (invitation) await ctx.db.patch(invitation._id, { status: "received" });
    }
    await ctx.db.patch(job._id, {
      state: "completed",
      providerRunId: result.providerRunId,
      outputDigest: hash,
      output: (["intake", "evidence_summary"].includes(job.role) || job.phase === "council")
        ? result.output
        : null,
      completedAt: Date.now(),
    });
    return { pending: false };
  },
});
export const getJob = internalQuery({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerJobs", args.jobId);
    return id ? ctx.db.get(id) : null;
  },
});
function fixtureSellerResult(input: Record<string, unknown>, phase: string) {
  const decision = fixtureSeller(input, phase);
  if (phase !== "negotiating") return decision;
  return { ...(input.finalBinding as object), decision: decision.kind === "propose"
    ? { kind: "propose", proposal: { ...decision.proposal, schemaVersion: 2, serviceOptionId: null } } : decision };
}
function fixtureSeller(
  input: Record<string, unknown>,
  phase: string,
): SellerDecision {
  const payload = input as {
    brief: import("./lib/sellerContracts.ts").SellerBrief;
    policy: import("./lib/sellerContracts.ts").PricingPolicy;
    snapshots: import("./lib/sellerContracts.ts").CatalogSnapshot[];
    candidateId: string;
    sellerJobId: string;
    preferredListingId?: string;
    parentOffer?: import("../src/contracts/index.ts").Contract<"OfferVersion">;
  };
  const { brief, policy, snapshots, candidateId, sellerJobId } = payload;
  if (phase === "council")
    return {
      kind: "hold",
      jobId: sellerJobId,
      offer: payload.parentOffer!.offer,
    };
  const lines: SellerProposal["lines"] = [];
  for (const line of brief.lines) {
    const options = snapshots.filter(
      (s) =>
        s.availableQuantity >= line.quantity &&
        assessLine(line, s).hardRequirementsPassed,
    );
    const snapshot =
      options.find(
        (s) => s.listing.listing.id === payload.preferredListingId,
      ) ||
      options.find((s) =>
        payload.parentOffer?.lines.some(
          (l) =>
            l.requestLineId === line.lineId &&
            l.listing.id === s.listing.listing.id,
        ),
      ) ||
      options[0];
    if (!snapshot)
      return { kind: "abstain", jobId: sellerJobId, reasonCode: "NO_MATCH" };
    const listing = snapshot.listing;
    const minimum = minimumUnitCents({
      referenceUnitCents: listing.referenceUnitCents,
      operatorFloorCents: listing.operatorFloorCents,
      maxDiscountBps: policy.maxDiscountBps,
      unitCostCents: policy.unitCostByListing[listing.listing.id],
      minimumContributionCents:
        policy.minimumContributionByListing[listing.listing.id],
    });
    const before =
      payload.parentOffer?.lines.find((l) => l.requestLineId === line.lineId)
        ?.unitCents ?? listing.referenceUnitCents;
    lines.push({
      requestLineId: line.lineId,
      listing: listing.listing,
      quantity: line.quantity,
      unitCents:
        phase === "negotiating"
          ? Math.max(
              minimum,
              Math.min(before, listing.referenceUnitCents) -
                Math.floor(listing.referenceUnitCents * 0.02),
            )
          : listing.referenceUnitCents,
    });
  }
  if (
    phase === "negotiating" &&
    payload.parentOffer &&
    lines.every(
      (line, i) => line.unitCents === payload.parentOffer!.lines[i].unitCents,
    )
  )
    return {
      kind: "hold",
      jobId: sellerJobId,
      offer: payload.parentOffer.offer,
    };
  return {
    kind: "propose",
    proposal: {
      schemaVersion: 1,
      jobId: sellerJobId,
      candidateId,
      parentOffer: payload.parentOffer?.offer ?? null,
      policy: policy.policy,
      lines,
      claims: [],
      fitArgument:
        "Deterministic fixture proposal using the merchant’s own catalog.",
      privatePriceRationale:
        "Fixture pricing only; no live model or calibrated strategy.",
    },
  };
}

export const failJob = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerJobs", args.jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (job && !["completed", "cancelled", "stale"].includes(job.state))
      await ctx.db.patch(job._id, { state: "failed", completedAt: Date.now() });
  },
});
export const phaseJobs = internalQuery({
  args: { runId: v.string(), phase: v.string() },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("buyerJobs")
      .withIndex("by_run_phase", (q) =>
        q.eq("runId", args.runId).eq("phase", args.phase),
      )
      .take(10);
    return jobs
      .filter((j) => j.role.startsWith("seller_") && !j.input.repairAttempt)
      .map((j) => ({
        id: String(j._id),
        merchantId: j.merchantId,
        deadlineAt: j.deadlineAt,
      }));
  },
});

function fixtureSummary(input: Record<string, unknown>) {
  const evidence =
    input.evidence as import("../src/contracts/index.ts").Contract<"Evidence">[];
  return {
    variantId: input.variantId,
    positives: evidence
      .filter((e) => e.verification === "supported")
      .map((e) => ({ text: e.claim, evidenceIds: [e.id] }))
      .slice(0, 20),
    concerns: evidence
      .filter((e) => e.verification === "contradicted")
      .map((e) => ({ text: e.claim, evidenceIds: [e.id] }))
      .slice(0, 20),
    gaps: evidence.some((e) => e.applicability === "family")
      ? [
          "Family sources do not establish the exact configuration or condition.",
        ]
      : [],
  };
}

export const pollIntake = internalAction({
  args: { jobId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const result = await ctx.runAction(internal.buyerJobs.dispatch, {
      jobId: args.jobId,
      poll: true,
    });
    if (result.pending)
      await ctx.scheduler.runAfter(buyerTiming.pollMs, internal.buyerJobs.pollIntake, args);
  },
});
export const cancelProvider = internalAction({
  args: { jobId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const job = await ctx.runQuery(internal.buyerJobs.getJob, args);
    if (job?.provider === "creao" && job.providerRunId)
      try {
        await cancelCreao({
          id: args.jobId,
          role: job.role,
          input: job.input,
          providerRunId: job.providerRunId,
          deadlineAt: job.deadlineAt,
          config: job.providerConfig ?? null,
        });
      } catch {
        /* Best effort; stale guards remain authoritative. */
      }
  },
});

export const createRepair = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }): Promise<string | null> => {
    const id = ctx.db.normalizeId("buyerJobs", jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (job?.state === "repairing" && job.output?.repairJobId)
      return String(job.output.repairJobId);
    if (
      !job ||
      ["completed", "failed", "stale", "cancelled"].includes(job.state) ||
      job.input.repairAttempt ||
      Date.now() + 1000 >= job.deadlineAt ||
      (job.runId && !(await currentRun(ctx, job.runId, job.phase)))
    )
      return null;
    const input = {
      ...job.input,
      repairAttempt: 1,
      repairInstruction:
        "The previous result failed schema or deterministic policy validation. Return one corrected result within the same scoped facts, policy, requirements and deadline. Do not invent fields, claims or sources.",
    };
    const child = await ctx.db.insert("buyerJobs", {
      runId: job.runId,
      requestId: job.requestId,
      version: job.version,
      phase: job.phase,
      role: job.role,
      merchantId: job.merchantId,
      candidateId: job.candidateId,
      sellerJobId: job.sellerJobId,
      state: "queued",
      input,
      inputDigest: await digest(input),
      provider: job.provider,
      providerConfig: job.providerConfig ?? null,
      providerRunId: null,
      outputDigest: null,
      output: null,
      deadlineAt: job.deadlineAt,
      createdAt: Date.now(),
      completedAt: null,
    });
    if (job.phase === "council" && input.schemaVersion === 2) {
      const repairedInput = { ...input, jobId: String(child) };
      await ctx.db.patch(child, { input: repairedInput, inputDigest: await digest(repairedInput) });
    }
    await ctx.db.patch(job._id, {
      state: "repairing",
      output: { repairJobId: String(child) },
    });
    if (job.runId)
      await emit(
        ctx,
        job.runId,
        "rejected",
        "One bounded retry/repair was requested; invalid output was not published.",
        job.merchantId,
      );
    return String(child);
  },
});
export const finishRepair = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const id = ctx.db.normalizeId("buyerJobs", jobId);
    const parent = id ? await ctx.db.get(id) : null;
    const childId = parent?.output?.repairJobId
      ? ctx.db.normalizeId("buyerJobs", parent.output.repairJobId)
      : null;
    const child = childId ? await ctx.db.get(childId) : null;
    if (parent?.state === "repairing" && child)
      await ctx.db.patch(parent._id, {
        state: child.state === "completed" ? "completed" : "failed",
        output: child.state === "completed" ? child.output : null,
        outputDigest: child.state === "completed" ? child.outputDigest : null,
        completedAt: Date.now(),
      });
  },
});

// Polling must support lookup by the stable job id when no remote run id was
// received. A transport failure is never permission to start a different job.
export const markAmbiguous = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const id = ctx.db.normalizeId("buyerJobs", jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (job && ["starting", "polling"].includes(job.state))
      await ctx.db.patch(job._id, { state: "pending" });
  },
});
