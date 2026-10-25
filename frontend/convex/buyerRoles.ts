import { snapshotCreaoConfig } from "./integrations/creaoBuyer.ts";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { contracts, type Contract } from "../src/contracts/index.ts";
import { currentRun, versionFor, digest, emit, fail, canonical, type ReadCtx, type WriteCtx } from "./buyer/core.ts";
import { buildSellerBrief } from "../src/backend/buyer/requests.ts";
import { councilPhases, publiclyEligible, publicOffer, factsFor, comparison, sourceRefs, factRefs, checkEnvelope, sameRef, type CouncilInput } from "./buyer/council.ts";
import type { Doc } from "./_generated/dataModel";

const phaseValidator = v.union(v.literal("brief"), v.literal("advocacy"), v.literal("reply"), v.literal("adjudication"));
export async function councilFor(ctx: ReadCtx, runId: string) {
  return ctx.db.query("buyerCouncils").withIndex("by_run", q => q.eq("runId", runId)).unique();
}
export const freezeCompetition = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<string | null> => {
    const run = await currentRun(ctx, runId, "council");
    if (!run) return null;
    const existing = await councilFor(ctx, runId);
    if (existing) return String(existing._id);
    const request = await versionFor(ctx, run.requestId, run.version);
    const candidates = await ctx.db.query("buyerOffers").withIndex("by_run_effective", q => q.eq("runId", runId).eq("effective", true)).take(6);
    const offers: Contract<"PublicCompetitionOffer">[] = [];
    for (const row of candidates.sort((a,b) => a.candidateId.localeCompare(b.candidateId))) {
      if (await publiclyEligible(ctx, row, request)) offers.push(await publicOffer(ctx, row, request));
    }
    if (new Set(offers.map(o => o.merchantId)).size < 2) {
      await ctx.db.patch(run._id, { stage: "negotiating", partial: true });
      await emit(ctx, runId, "council_phase_closed", "Fewer than two eligible merchants; no competitive council was started.");
      return null;
    }
    const facts = factsFor(offers);
    const id = await ctx.db.insert("buyerCouncils", { runId, snapshot: null, snapshotDigest: "", facts,
      phase: "brief", statuses: [], comparisons: [], challenges: [], defenses: [], replies: [], outcomes: [], outcomeVersion: 0 });
    const { runId: projectedRunId, ...publicBrief } = buildSellerBrief(request, runId);
    if (projectedRunId !== runId) fail("INVALID_INPUT", "Seller projection run mismatch.");
    const snapshot = contracts.CompetitionSnapshot.parse({ schemaVersion: 2, snapshot: { id: String(id), version: 1 },
      councilId: String(id), request: request.request, runId, createdAt: Date.now(), brief: publicBrief,
      offers, approvedFactIds: facts.map(f => f.id), approvedSourceIds: [...new Set([
        ...facts.flatMap(f => f.sourceIds), ...offers.flatMap(o => o.claims.flatMap(c => c.sourceIds)),
      ])] });
    // SellerBrief carries runId; ConfirmedBrief intentionally does not.
    const snapshotDigest = await digest(snapshot);
    const schedule = run.config.councilSchedule ?? { brief: run.startedAt + 45000, advocacy: run.startedAt + 55000, reply: run.startedAt + 65000, adjudication: run.startedAt + 75000 };
    const statuses = councilPhases.map(phase => ({ phase, expected: 0, completed: 0, missing: 0, closed: false,
      deadlineAt: Math.min(schedule[phase], run.deadlineAt) }));
    await ctx.db.patch(id, { snapshot, snapshotDigest, statuses });
    for (const offer of offers) await ctx.db.insert("buyerFinalInvitations", { runId, councilId: String(id), roundId: null,
      candidateId: offer.candidateId, merchantId: offer.merchantId, openingOffer: offer.offer,
      snapshot: snapshot.snapshot, snapshotDigest, outcomeVersion: 0, deadlineAt: run.deadlineAt,
      status: "pending", jobId: null });
    await emit(ctx, runId, "snapshot_published", `One frozen public comparison published for ${new Set(offers.map(o => o.merchantId)).size} merchants and ${offers.length} candidates.`);
    return String(id);
  },
});
export const prepareCouncilJobs = internalMutation({
  args: { runId: v.string(), phase: phaseValidator },
  handler: async (ctx, { runId, phase }): Promise<string[]> => {
    const run = await currentRun(ctx, runId, "council");
    const council = await councilFor(ctx, runId);
    if (!run || !council || council.phase !== phase) return [];
    const existing = (await ctx.db.query("buyerJobs").withIndex("by_run_phase", q => q.eq("runId", runId).eq("phase", "council")).take(40))
      .filter(j => j.input?.schemaVersion === 2 && j.input.phase === phase && !j.input.repairAttempt);
    if (existing.length) return existing.map(j => String(j._id));
    const snapshot = contracts.CompetitionSnapshot.parse(council.snapshot);
    const role = ({ brief: "moderator_brief", advocacy: "seller_advocacy", reply: "seller_reply", adjudication: "moderator_adjudication" } as const)[phase];
    const challenges = contracts.AdmittedChallenge.array().parse(council.challenges);
    const merchants: (string | null)[] = phase === "brief" ? [null] : phase === "adjudication" ? (challenges.length ? [null] : [])
      : phase === "advocacy" ? [...new Set(snapshot.offers.map(o => o.merchantId))] : [...new Set(challenges.map(c => c.targetMerchantId))];
    const deadlineAt = (council.statuses as Contract<"BuyerRunView">["councilStatus"]).find(s => s.phase === phase)!.deadlineAt;
    const ids: string[] = [];
    for (const merchantId of merchants) {
      const id = await ctx.db.insert("buyerJobs", { runId, requestId: run.requestId, version: run.version, phase: "council", role,
        merchantId, candidateId: null, sellerJobId: null, state: "queued", input: null, inputDigest: "",
        provider: merchantId ? "fixture" : run.config.agents === "live" ? "creao" : "fixture",
        providerConfig: merchantId ? null : snapshotCreaoConfig(role),
        providerRunId: null, outputDigest: null, output: null, deadlineAt, createdAt: Date.now(), completedAt: null });
      const input = contracts.CouncilJobInput.parse({ schemaVersion: 2, jobId: String(id), councilId: String(council._id),
        request: snapshot.request, runId, snapshot: snapshot.snapshot, snapshotDigest: council.snapshotDigest,
        phase, deadlineAt, role, merchantId, competition: snapshot, facts: council.facts,
        ownOffers: snapshot.offers.filter(o => o.merchantId === merchantId).map(o => o.offer),
        comparisons: merchantId ? council.comparisons.filter((c: {merchantId:string}) => c.merchantId === merchantId) : council.comparisons,
        challenges: phase === "reply" ? challenges.filter(c => c.targetMerchantId === merchantId) : phase === "adjudication" ? challenges : [],
        defenses: phase === "adjudication" ? council.defenses : [], replies: phase === "adjudication" ? council.replies : [] });
      await ctx.db.patch(id, { input, inputDigest: await digest(input) });
      ids.push(String(id));
    }
    await ctx.db.patch(council._id, { statuses: council.statuses.map((s: Contract<"BuyerRunView">["councilStatus"][number]) => s.phase === phase ? { ...s, expected: ids.length } : s) });
    return ids;
  },
});
export const councilJobs = internalQuery({
  args: { runId: v.string(), phase: phaseValidator },
  handler: async (ctx, { runId, phase }) => (await ctx.db.query("buyerJobs").withIndex("by_run_phase", q => q.eq("runId", runId).eq("phase", "council")).take(40))
    .filter(j => j.input?.schemaVersion === 2 && j.input.phase === phase && !j.input.repairAttempt)
    .map(j => ({ id: String(j._id), deadlineAt: j.deadlineAt })),
});
export async function activeCouncilJob(ctx: ReadCtx, job: Doc<"buyerJobs">) {
  if (job.phase !== "council" || job.input?.schemaVersion !== 2) return true;
  const council = job.runId ? await councilFor(ctx, job.runId) : null;
  const input = contracts.CouncilJobInput.safeParse(Object.fromEntries(Object.entries(job.input).filter(([key]) => !["repairAttempt", "repairInstruction"].includes(key))));
  if (input.success && input.data.merchantId) {
    const request = await versionFor(ctx, job.requestId, job.version);
    const rows = await ctx.db.query("buyerOffers").withIndex("by_run_effective", q => q.eq("runId", job.runId!).eq("effective", true)).take(6);
    let eligible = false;
    for (const row of rows) if (row.merchantId === input.data.merchantId && input.data.ownOffers.some(o => sameRef(o, row.data.offer)) && await publiclyEligible(ctx, row, request)) eligible = true;
    if (!eligible) return false;
  }
  return !!council && input.success && council.phase === input.data.phase && Date.now() < job.deadlineAt &&
    String(council._id) === input.data.councilId && council.snapshotDigest === input.data.snapshotDigest &&
    sameRef(council.snapshot.snapshot, input.data.snapshot) && input.data.runId === job.runId &&
    input.data.request.id === job.requestId && input.data.request.version === job.version &&
    input.data.merchantId === job.merchantId && input.data.role === job.role && input.data.jobId === String(job._id) &&
    await digest(job.input) === job.inputDigest && canonical(input.data.competition) === canonical(council.snapshot) &&
    canonical(input.data.facts) === canonical(council.facts);
}
export async function completeCouncilOutput(ctx: WriteCtx, job: Doc<"buyerJobs">, output: unknown) {
  if (!(await activeCouncilJob(ctx, job))) fail("STALE_VERSION", "Council phase closed or job binding changed.");
  const input = job.input as CouncilInput;
  const council = (await councilFor(ctx, input.runId))!;
  checkEnvelope(input, output);
  if (job.role === "moderator_brief") {
    const result = contracts.ModeratorBrief.parse(output);
    const expected = [...new Set(input.competition.offers.map(o => o.merchantId))];
    if (result.participants.length !== expected.length || new Set(result.participants.map(p => p.merchantId)).size !== expected.length ||
        result.participants.some(p => !expected.includes(p.merchantId))) fail("INVALID_INPUT", "Brief must cover each participating merchant once.");
    const comparisons = result.participants.map(p => ({ merchantId: p.merchantId, points: p.points.map(point => comparison(input, point, p.merchantId)) }));
    await ctx.db.patch(council._id, { comparisons });
    for (const p of comparisons) for (const point of p.points) await emit(ctx, input.runId, "comparative_brief", point.summary, p.merchantId, point.ownOffer);
  } else if (job.role === "seller_advocacy") {
    const result = contracts.SellerAdvocacy.parse(output);
    if (new Set(result.defenses.map(d => canonical(d.ownOffer))).size !== result.defenses.length) fail("INVALID_INPUT", "Duplicate defense.");
    const defenses = result.defenses.map(d => {
      if (!input.ownOffers.some(o => sameRef(o, d.ownOffer))) fail("FORBIDDEN", "Defense is not the merchant's offer.");
      factRefs(input, d.factIds, [d.ownOffer]); sourceRefs(input, d.sourceIds);
      return { ...d, text: d.factIds.length ? `Merchant references ${d.factIds.length} recorded facts for its frozen offer; these statements grant no new terms.` : "Merchant supplied no checked factual defense." };
    });
    let challenges = council.challenges as Contract<"AdmittedChallenge">[];
    if (result.challenge) {
      const c = result.challenge;
      const target = input.competition.offers.find(o => sameRef(o.offer, c.targetOffer) && o.merchantId !== job.merchantId);
      if (!target || (c.claimId && !target.claims.some(cl => cl.id === c.claimId)) ||
          (c.factId && !input.facts.some(f => f.id === c.factId && sameRef(f.offer, target.offer)))) fail("INVALID_INPUT", "Challenge target is outside the rival offer.");
      sourceRefs(input, c.sourceIds);
      if (challenges.some(c => c.authorMerchantId === job.merchantId)) fail("INVALID_INPUT", "Only one outgoing challenge per merchant.");
      challenges = [...challenges, { id: `challenge:${String(job._id)}`, authorMerchantId: job.merchantId!, targetMerchantId: target.merchantId,
        challenge: { ...c, question: "Please verify the referenced recorded fact or claim for this frozen configuration." } }];
    }
    await ctx.db.patch(council._id, { challenges, defenses: [...council.defenses, { merchantId: job.merchantId, defenses }] });
    for (const d of defenses) await emit(ctx, input.runId, "council_advocacy", d.text, job.merchantId, d.ownOffer);
  } else if (job.role === "seller_reply") {
    const result = contracts.SellerReply.parse(output);
    const expected = input.challenges.map(c => c.id);
    if (result.answers.length !== expected.length || new Set(result.answers.map(a => a.challengeId)).size !== expected.length ||
        result.answers.some(a => !expected.includes(a.challengeId))) fail("INVALID_INPUT", "Reply must answer every assigned challenge exactly once.");
    const answers = result.answers.map(a => {
      const target = input.challenges.find(c => c.id === a.challengeId)!;
      factRefs(input, a.factIds, [target.challenge.targetOffer]); sourceRefs(input, a.sourceIds);
      return { ...a, text: a.disposition === "unknown" ? "Merchant acknowledges uncertainty about the referenced fact." : "Merchant replied using the recorded public facts; the backend will check the outcome." };
    });
    await ctx.db.patch(council._id, { replies: [...council.replies, { merchantId: job.merchantId, answers }] });
    await emit(ctx, input.runId, "council_reply", `One grouped reply answered ${answers.length} admitted challenge(s).`, job.merchantId);
  } else {
    const result = contracts.ModeratorAdjudication.parse(output);
    if (result.outcomes.length !== input.challenges.length || new Set(result.outcomes.map(o => o.challengeId)).size !== input.challenges.length)
      fail("INVALID_INPUT", "Adjudication must cover every admitted challenge once.");
    for (const o of result.outcomes) {
      const challenge = input.challenges.find(c => c.id === o.challengeId);
      if (!challenge) fail("INVALID_INPUT", "Unknown challenge.");
      factRefs(input, o.factIds, [challenge.challenge.targetOffer]); sourceRefs(input, o.sourceIds);
    }
    // Model verdicts cannot establish contradictions. Close derives checked outcomes from facts/replies.
  }
}
export const closeCouncilPhase = internalMutation({
  args: { runId: v.string(), phase: phaseValidator },
  handler: async (ctx, { runId, phase }): Promise<boolean> => {
    const run = await currentRun(ctx, runId, "council");
    const council = await councilFor(ctx, runId);
    if (!run || !council || council.phase !== phase) return false;
    const jobs = (await ctx.db.query("buyerJobs").withIndex("by_run_phase", q => q.eq("runId", runId).eq("phase", "council")).take(40))
      .filter(j => j.input?.schemaVersion === 2 && j.input.phase === phase && !j.input.repairAttempt);
    const status = (council.statuses as Contract<"BuyerRunView">["councilStatus"]).find(s => s.phase === phase)!;
    if (Date.now() < status.deadlineAt && jobs.some(j => ["queued", "starting", "polling", "pending", "repairing"].includes(j.state))) return false;
    const completed = jobs.filter(j => j.state === "completed").length;
    for (const job of jobs) if (!["completed", "failed", "stale", "cancelled"].includes(job.state)) await ctx.db.patch(job._id, { state: "stale", completedAt: Date.now() });
    const statuses = council.statuses.map((s: Contract<"BuyerRunView">["councilStatus"][number]) => s.phase === phase ? { ...s, expected: jobs.length, completed, missing: jobs.length - completed, closed: true } : s);
    const next: string = councilPhases[councilPhases.indexOf(phase) + 1] ?? "closed";
    await ctx.db.patch(council._id, { phase: next, statuses });
    if (completed < jobs.length) await ctx.db.patch(run._id, { partial: true });
    await emit(ctx, runId, "council_phase_closed", `${phase}: ${completed}/${jobs.length} responses checked; missing responses are not admissions.`);
    if (next === "closed") {
      const challenges = council.challenges as Contract<"AdmittedChallenge">[];
      const outcomes = challenges.map((c, index) => {
        const answer = (council.replies as CouncilInput["replies"]).flatMap(r => r.answers).find(a => a.challengeId === c.id);
        const fact = (council.facts as Contract<"CouncilFact">[]).find(f => f.id === c.challenge.factId);
        const finding = !answer || answer.disposition === "unknown" || !fact ? "unknown" as const
          : fact.status === "unmet" ? "contradicted" as const : fact.status === "unknown" ? "unknown" as const : "supported" as const;
        return contracts.CheckedCouncilOutcome.parse({ id: `outcome:${String(council._id)}:${index}`, snapshot: council.snapshot.snapshot,
          challengeId: c.id, targetOffer: c.challenge.targetOffer, finding, factIds: fact ? [fact.id] : [], sourceIds: fact?.sourceIds ?? [],
          summary: finding === "supported" ? "The referenced recorded fact remains supported; rhetoric changes no ranking points."
            : finding === "contradicted" ? "The recorded requirement is contradicted; deterministic revalidation controls eligibility."
            : "The challenge remains unresolved; unanswered or unsupported accusations cause no ranking penalty." });
      });
      await ctx.db.patch(council._id, { outcomes, outcomeVersion: 1 });
      for (const outcome of outcomes) await emit(ctx, runId, "council_outcome", outcome.summary, null, outcome.targetOffer);
      const request = await versionFor(ctx, run.requestId, run.version);
      const rows = await ctx.db.query("buyerOffers").withIndex("by_run_effective", q => q.eq("runId", runId).eq("effective", true)).take(6);
      for (const row of rows) if (!(await publiclyEligible(ctx, row, request))) await ctx.db.patch(row._id, {
        data: { ...row.data, requirementsValidExceptBudget: false, selectable: false },
        card: { ...row.card, selectable: false, unavailableReason: "Public eligibility changed during council." } });
      await ctx.db.patch(run._id, { stage: "negotiating", updatedAt: Date.now() });
    }
    return true;
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
            providerConfig: snapshotCreaoConfig("evidence_summary"),
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
