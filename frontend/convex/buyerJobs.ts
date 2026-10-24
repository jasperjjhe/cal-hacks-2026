import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { z } from "zod";
import { contracts } from "../src/contracts/index.ts";
import { buildSellerBrief } from "../src/backend/buyer/requests.ts";
import {
  currentRun,
  versionFor,
  requestFor,
  digest,
  fail,
  emit,
} from "./buyer/core.ts";
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
    const inputData = { draft };
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
        providerRunId: null,
        outputDigest: null,
        output: null,
        deadlineAt: Date.now() + 30000,
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
            provider: run.config.agents === "live" ? "creao" : "fixture",
            providerConfigRevision: run.config.revision,
            inputDigest,
            inputRef,
            deadlineAt: Math.min(run.deadlineAt, run.startedAt + 75000),
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
                provider: run.config.agents === "live" ? "creao" : "fixture",
                providerRunId: null,
                outputDigest: null,
                output: null,
                deadlineAt: Math.min(run.deadlineAt, run.startedAt + 75000),
                createdAt: now,
                completedAt: null,
              }),
            ),
          );
        }
      }
    } else if (args.phase === "council" || args.phase === "negotiating") {
      const rows = await ctx.db
        .query("buyerOffers")
        .withIndex("by_run_effective", (q) =>
          q.eq("runId", args.runId).eq("effective", true),
        )
        .take(6);
      const moderator = await ctx.db
        .query("buyerJobs")
        .withIndex("by_run_phase", (q) =>
          q.eq("runId", args.runId).eq("phase", "council"),
        )
        .filter((q) => q.eq(q.field("role"), "moderator"))
        .first();
      const plan = moderator?.output as
        | import("../src/contracts/index.ts").Contract<"ChallengePlan">
        | null;
      const selected =
        args.phase === "council"
          ? rows.filter(
              (row, index, all) =>
                all.findIndex((r) => r.merchantId === row.merchantId) ===
                  index &&
                plan?.challenges.some(
                  (c) =>
                    c.offer.id === row.data.offer.id &&
                    c.offer.version === row.data.offer.version,
                ),
            )
          : rows;
      for (const row of selected) {
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
          args.phase === "negotiating" ? now + 30000 : run.startedAt + 75000,
        );
        await ctx.db.patch(jobs._id, {
          role: args.phase === "council" ? "seller_response" : "seller_final",
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
          challenge:
            args.phase === "council"
              ? plan?.challenges.find((c) => c.offer.id === row.data.offer.id)
              : null,
          feedback:
            args.phase === "negotiating"
              ? "A final permitted improvement may help this offer; no rival confidential data is shared."
              : null,
        };
        ids.push(
          String(
            await ctx.db.insert("buyerJobs", {
              runId: args.runId,
              requestId: run.requestId,
              version: run.version,
              phase: args.phase,
              role:
                args.phase === "council" ? "seller_response" : "seller_final",
              merchantId: row.merchantId,
              candidateId: row.candidateId,
              sellerJobId,
              state: "queued",
              input: payload,
              inputDigest: await digest(payload),
              provider: run.config.agents === "live" ? "creao" : "fixture",
              providerRunId: null,
              outputDigest: null,
              output: null,
              deadlineAt,
              createdAt: now,
              completedAt: null,
            }),
          ),
        );
        if (args.phase === "council")
          await emit(
            ctx,
            args.runId,
            "challenge",
            "An exact-configuration requirement/condition check was requested.",
            row.merchantId,
            row.data.offer,
          );
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
    if (Date.now() >= job.deadlineAt) {
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
            job.role === "intake"
              ? fixtureIntake(contracts.DraftView.parse(job.input.draft))
              : job.role === "moderator"
                ? fixtureModerator(job.input)
                : job.role === "evidence_summary"
                  ? fixtureSummary(job.input)
                  : fixtureSeller(job.input, job.phase),
        };
      else
        result = await (args.poll ? pollCreao : invokeCreao)({
          id: args.jobId,
          role: job.role,
          input: job.input,
          providerRunId: job.providerRunId,
          deadlineAt: job.deadlineAt,
        });
    } catch {
      result = { status: "failed" as const, providerRunId: job.providerRunId };
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
    if(job?.state==="completed"&&job.outputDigest&&args.result?.status==="completed"){if(await digest(args.result.output)!==job.outputDigest)fail("INVALID_INPUT","Mismatched provider replay.");return {pending:false};}
    if (!job || !["starting", "polling", "pending"].includes(job.state))
      return { pending: false };
    if (
      (job.runId && !(await currentRun(ctx, job.runId, job.phase))) ||
      Date.now() >= job.deadlineAt
    ) {
      await ctx.db.patch(job._id, { state: "stale" });
      return { pending: false };
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
    } else if (job.role === "moderator") {
      const plan = contracts.ChallengePlan.parse(result.output);
      const merchants = new Set<string>();
      for (const challenge of plan.challenges) {
        const offer = job.input.offers.find(
          (o: { offer: { id: string; version: number } }) =>
            o.offer.id === challenge.offer.id &&
            o.offer.version === challenge.offer.version,
        );
        if (
          !offer ||
          merchants.has(offer.merchantId) ||
          !offer.claims.some(
            (c: { id: string }) => c.id === challenge.claimId,
          ) ||
          challenge.sourceIds.some((id) => !job.input.sourceIds.includes(id))
        )
          fail("INVALID_INPUT", "Invalid challenge scope.");
        merchants.add(offer.merchantId);
      }
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
      const decision = result.output as SellerDecision;
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
      if (!accepted.ok && !job.input.repairAttempt)
        throw new Error("Proposal requires one bounded repair.");
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
    await ctx.db.patch(job._id, {
      state: "completed",
      providerRunId: result.providerRunId,
      outputDigest: hash,
      output: ["intake", "moderator", "evidence_summary"].includes(job.role)
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

function fixtureModerator(input: Record<string, unknown>) {
  const offers = input.offers as {
    offer: { id: string; version: number };
    merchantId: string;
    claims: { id: string }[];
  }[];
  const seen = new Set<string>();
  return {
    challenges: offers
      .filter(
        (o) =>
          o.claims.length &&
          !seen.has(o.merchantId) &&
          !!seen.add(o.merchantId),
      )
      .map((o) => ({
        offer: o.offer,
        claimId: o.claims[0].id,
        question:
          "Please substantiate this material claim for the exact product configuration.",
        sourceIds: [],
      }))
      .slice(0, 3),
    summary: "Only explicit, material seller claims receive a challenge.",
  };
}
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
      await ctx.scheduler.runAfter(5000, internal.buyerJobs.pollIntake, args);
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
    if(job?.state==="repairing"&&job.output?.repairJobId)return String(job.output.repairJobId);
    if (
      !job ||
      ["completed","failed","stale","cancelled"].includes(job.state)||
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
      providerRunId: null,
      outputDigest: null,
      output: null,
      deadlineAt: job.deadlineAt,
      createdAt: Date.now(),
      completedAt: null,
    });
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
        completedAt: Date.now(),
      });
  },
});
