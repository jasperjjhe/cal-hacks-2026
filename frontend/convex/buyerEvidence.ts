import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { contracts } from "../src/contracts/index.ts";
import { currentRun, digest, emit } from "./buyer/core.ts";
import { startEvidence, pollEvidence } from "./integrations/buyerTools.ts";
import { evidenceRegistry } from "./integrations/apifyBuyer.ts";
import { z } from "zod";
import { assessLine, weightedCoverage } from "./lib/sellerValidation";
import { versionFor } from "./buyer/core";
import { loadSnapshots } from "./sellerInternal.ts";
import type { WriteCtx } from "./buyer/core.ts";
// Configure server-owned source URLs and pinned Actor build only after the
// adapter is verified. Buyer/model strings never become crawler destinations.
function registry(): z.infer<typeof evidenceRegistry> {
  try {
    return evidenceRegistry.parse(JSON.parse(
      process.env.BUYER_EVIDENCE_REGISTRY ??
        '{"build":"unconfigured","sources":[]}',
    ));
  } catch {
    return { build: "unconfigured", sources: [] };
  }
}
function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.port === "" &&
      !/^(localhost|.*\.local|\d[\d.]*|\[)/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}
async function prepare(
  ctx: WriteCtx,
  runId: string,
  refill: boolean,
): Promise<string[]> {
  const run = await currentRun(ctx, runId, "researching");
  if (!run) return [];
  const researchDeadlineAt = Math.min(
    run.deadlineAt,
    run.config.researchDeadlineAt ?? Date.now() + 60000,
  );
  if (!run.config.researchDeadlineAt)
    await ctx.db.patch(run._id, {
      config: { ...run.config, researchDeadlineAt },
    });
  const prior = await ctx.db
    .query("buyerResearch")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(5);
  if (refill) {
    if (run.refillCount >= 1) return [];
    await ctx.db.patch(run._id, { refillCount: 1 });
  } else if (prior.length) return prior.map((j) => String(j._id));
  const offers = await ctx.db
    .query("buyerOffers")
    .withIndex("by_run_effective", (q) =>
      q.eq("runId", runId).eq("effective", true),
    )
    .take(6);
  const ordered = offers
    .filter((o) => o.data.requirementsValidExceptBudget && o.data.affordable)
    .sort(
      (a, b) =>
        a.card.totalCents - b.card.totalCents ||
        a.candidateId.localeCompare(b.candidateId),
    );
  const identities = [
    ...new Set(ordered.map((o) => o.card.products[0].variantId as string)),
  ]
    .filter((id) => !prior.some((j) => j.variantId === id))
    .slice(0, (refill ? 5 : 4) - prior.length);
  const ids: string[] = [];
  const reg = registry();
  for (const variantId of identities) {
    const row = ordered.find(
      (o) => o.card.products[0].variantId === variantId,
    )!;
    const snapshots = await loadSnapshots(ctx, row.merchantId);
    const product = snapshots.find((s) => s.variant.id === variantId)?.variant;
    if (!product) continue;
    const sources = reg.sources
      .filter((s) => s.variantId === variantId && safeUrl(s.url))
      .slice(0, 8);
    const input = {
      variantId,
      syntheticProduct: product.syntheticProduct,
      sourceIds: sources.map((s) => s.id),
      urls: sources.map((s) => s.url),
      inputDigest: "",
      actorId: reg.actorId ?? "",
      build: reg.build,
      buildNumber: reg.buildNumber ?? "",
      sources,
    };
    input.inputDigest = await digest({
      variantId,
      profile: product.profile,
      identity: product.manufacturerPartNumber,
      syntheticProduct: product.syntheticProduct,
      sources,
      build: reg.build,
      actorId: reg.actorId ?? null,
      buildNumber: reg.buildNumber ?? null,
    });
    const cachedRows = await ctx.db
      .query("buyerEvidence")
      .withIndex("by_digest_time", (q) =>
        q
          .eq("digest", input.inputDigest)
          .gte("retrievedAt", Date.now() - 86400000),
      )
      .take(40);
    const cached = cachedRows.filter(
      (e, i, all) =>
        all.findIndex((other) => other.data.id === e.data.id) === i,
    );
    const id = await ctx.db.insert("buyerResearch", {
      runId,
      variantId,
      digest: input.inputDigest,
      state: cached.length
        ? "cached"
        : product.syntheticProduct || !sources.length
          ? "unavailable"
          : "queued",
      providerRunId: null,
      providerBuild: reg.build,
      input,
      deadlineAt: researchDeadlineAt,
      createdAt: Date.now(),
    });
    ids.push(String(id));
    if (cached.length)
      for (const source of cached)
        await ctx.db.insert("buyerEvidence", {
          variantId,
          digest: input.inputDigest,
          runId,
          data: source.data,
          facts: source.facts ?? [],
          retrievedAt: source.retrievedAt,
        });
    if (cached.length || product.syntheticProduct || !sources.length)
      await attach(
        ctx,
        runId,
        variantId,
        cached.map((s) => s.data),
        cached.length ? "cached" : "unavailable",
        cached.flatMap((e) => e.facts ?? []),
      );
  }
  return ids;
}
export const prepareResearch = internalMutation({
  args: { runId: v.string() },
  handler: (ctx, { runId }): Promise<string[]> => prepare(ctx, runId, false),
});
export const refillResearch = internalMutation({
  args: { runId: v.string() },
  handler: (ctx, { runId }): Promise<string[]> => prepare(ctx, runId, true),
});
export const claim = internalMutation({
  args: { researchJobId: v.string(), poll: v.boolean() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("buyerResearch", args.researchJobId);
    const job = id ? await ctx.db.get(id) : null;
    if (!job || !(await currentRun(ctx, job.runId, "researching"))) return null;
    if (Date.now() >= job.deadlineAt) {
      await ctx.db.patch(job._id, { state: "unavailable" });
      await ctx.db.patch(job._id, { state: "unavailable" });
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return null;
    }
    if (args.poll ? job.state !== "pending" : job.state !== "queued")
      return null;
    const run = await currentRun(ctx, job.runId, "researching");
    if (!run || run.toolCalls >= 40) {
      await ctx.db.patch(job._id, { state: "unavailable" });
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return null;
    }
    await ctx.db.patch(run._id, { toolCalls: run.toolCalls + 1 });
    await ctx.db.patch(job._id, { state: "acquiring" });
    return job;
  },
});
export const acquire = internalAction({
  args: { researchJobId: v.string(), poll: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.runMutation(internal.buyerEvidence.claim, {
      researchJobId: args.researchJobId,
      poll: args.poll ?? false,
    });
    if (!job) return false;
    let result;
    try {
      result = args.poll
        ? await pollEvidence(job.input, job.providerRunId!)
        : await startEvidence(job.input);
    } catch {
      result = { status: "unavailable" as const };
    }
    try {
      return await ctx.runMutation(internal.buyerEvidence.complete, {
        researchJobId: args.researchJobId,
        result,
      });
    } catch {
      return ctx.runMutation(internal.buyerEvidence.complete, {
        researchJobId: args.researchJobId,
        result: { status: "unavailable" },
      });
    }
  },
});
export const complete = internalMutation({
  args: { researchJobId: v.string(), result: v.any() },
  handler: async (ctx, args): Promise<boolean> => {
    const id = ctx.db.normalizeId("buyerResearch", args.researchJobId);
    const job = id ? await ctx.db.get(id) : null;
    if (
      !job ||
      job.state !== "acquiring" ||
      !(await currentRun(ctx, job.runId, "researching"))
    )
      return false;
    const result = args.result;
    if (result.status === "unavailable" || Date.now() >= job.deadlineAt) {
      await ctx.db.patch(job._id, { state: "unavailable" });
      await attach(ctx, job.runId, job.variantId, [], "unavailable");
      return false;
    }
    if (
      !["pending", "completed"].includes(result.status) ||
      result.build !== job.providerBuild ||
      typeof result.providerRunId !== "string" ||
      !result.providerRunId ||
      (job.providerRunId && result.providerRunId !== job.providerRunId)
    )
      throw new Error("Evidence provenance mismatch");
    if (result.status === "pending") {
      await ctx.db.patch(job._id, {
        state: "pending",
        providerRunId: result.providerRunId,
      });
      return true;
    }
    const evidence = contracts.Evidence.array().max(40).parse(result.evidence);
    const facts = z
      .array(
        z.strictObject({
          evidenceId: contracts.Ref.shape.id,
          fieldId: contracts.Ref.shape.id,
          value: z.union([
            z.string().max(4000),
            z.number().finite(),
            z.boolean(),
            z.array(z.string().max(4000)).max(100),
            z.null(),
          ]),
          unit: z.string().max(100).nullable(),
        }),
      )
      .max(100)
      .parse(result.facts ?? []);
    for (const fact of facts) {
      const source = evidence.find((e) => e.id === fact.evidenceId);
      if (
        ["healthPercent", "includedCharger", "chargerIncluded"].includes(
          fact.fieldId,
        ) ||
        !source ||
        source.applicability !== "exact_variant" ||
        source.sourceType === "owner_report" ||
        job.input.syntheticProduct
      )
        throw new Error("Fact is not an authoritative exact-product source");
    }
    const seen = new Set<string>();
    const allowed = job.input.urls as string[];
    for (const e of evidence) {
      if (
        e.variantId !== job.variantId ||
        e.providerRunId !== result.providerRunId ||
        e.providerBuild !== job.providerBuild ||
        !safeUrl(e.url) ||
        !allowed.includes(e.url) ||
        e.retrievedAt > Date.now() ||
        e.retrievedAt < Date.now() - 86400000 ||
        (job.input.syntheticProduct && e.sourceType === "owner_report")
      )
        throw new Error("Inapplicable evidence");
    }
    const unique = evidence.filter((e) => {
      const key = `${e.duplicateGroup}:${e.claim.trim().toLowerCase()}:${e.excerpt.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (const e of unique)
      await ctx.db.insert("buyerEvidence", {
        variantId: job.variantId,
        digest: job.digest,
        runId: job.runId,
        data: e,
        facts: facts.filter((f) => f.evidenceId === e.id),
        retrievedAt: e.retrievedAt,
      });
    await ctx.db.patch(job._id, {
      state: "completed",
      providerRunId: result.providerRunId,
    });
    await attach(
      ctx,
      job.runId,
      job.variantId,
      unique,
      unique.length ? "complete" : "unavailable",
      facts,
    );
    return false;
  },
});
async function attach(
  ctx: WriteCtx,
  runId: string,
  variantId: string,
  evidence: import("../src/contracts/index.ts").Contract<"Evidence">[],
  status: string,
  facts: {
    evidenceId: string;
    fieldId: string;
    value: string | number | boolean | string[] | null;
    unit: string | null;
  }[] = [],
) {
  const rows = await ctx.db
    .query("buyerOffers")
    .withIndex("by_run_effective", (q) =>
      q.eq("runId", runId).eq("effective", true),
    )
    .take(6);
  for (const row of rows)
    if (row.card.products[0].variantId === variantId) {
      // Authoritative exact-identity contradictions block selection pending S's
      // reassessment. Family/owner commentary can never certify or negate fit.
      const factValue = (fact: (typeof facts)[number]) => JSON.stringify([
        Array.isArray(fact.value) ? [...fact.value].sort() : fact.value,
        fact.unit,
      ]);
      const conflictingFields = new Set(
        facts.filter(fact => facts.some(other =>
          other.fieldId === fact.fieldId && factValue(other) !== factValue(fact),
        )).map(fact => fact.fieldId),
      );
      const contradicted = conflictingFields.size > 0 || evidence.some(
        (e) =>
          e.applicability === "exact_variant" &&
          e.sourceType !== "owner_report" &&
          e.verification === "contradicted",
      );
      const run = await currentRun(ctx, runId, "researching");
      if (!run) return;
      const request = await versionFor(ctx, run.requestId, run.version);
      const snapshots = await loadSnapshots(ctx, row.merchantId);
      const assessments = [];
      for (const line of request.brief.lines) {
        const offerLine = row.data.lines.find(
          (l: { requestLineId: string }) => l.requestLineId === line.lineId,
        );
        const snapshot = snapshots.find(
          (s) => s.listing.listing.id === offerLine?.listing.id,
        );
        if (!snapshot) continue;
        const copy = {
          ...snapshot,
          variant: {
            ...snapshot.variant,
            attributes: { ...snapshot.variant.attributes },
          },
        };
        if (copy.variant.id === variantId) {
          const profile = await ctx.db
            .query("categoryProfiles")
            .withIndex("by_profileId_and_version", (q) =>
              q
                .eq("profileId", line.profile.id)
                .eq("version", line.profile.version),
            )
            .unique();
          for (const fact of facts) {
            if (conflictingFields.has(fact.fieldId)) continue;
            const field = profile?.fields.find((f) => f.id === fact.fieldId);
            if (!field) throw new Error("Unsupported source fact field");
            const value = fact.value;
            const typed =
              value === null ||
              (field.kind === "number" && typeof value === "number") ||
              (field.kind === "string" && typeof value === "string") ||
              (field.kind === "boolean" && typeof value === "boolean") ||
              (field.kind === "string_array" && Array.isArray(value));
            if (!typed) throw new Error("Source fact type mismatch");
            copy.variant.attributes[fact.fieldId] = {
              value,
              unit: fact.unit,
              provenance: "real_report",
              sourceId: fact.evidenceId,
            };
          }
        }
        assessments.push(assessLine(line, copy));
      }
      const results = assessments.flatMap((a) => a.requirements);
      const hardPass =
        assessments.length === request.brief.lines.length &&
        assessments.every((a) => a.hardRequirementsPassed) &&
        !contradicted;
      const fit = {
        ...row.card.fit,
        hardRequirementsPass: hardPass,
        coveragePercent: weightedCoverage(results),
        checks: row.card.fit.checks.map(
          (
            check: import("../src/contracts/index.ts").Contract<"FitAssessment">["checks"][number],
          ) => {
            const result = results.find(
              (r) => r.requirementId === check.requirementId,
            );
            const req = request.brief.lines
              .flatMap((l) => l.requirements)
              .find((r) => r.id === check.requirementId);
            const fact = facts.find((f) => f.fieldId === req?.fieldId);
            return result
              ? {
                  ...check,
                  status:
                    result.status === "satisfied" ? "matched" : result.status,
                  ...(fact
                    ? {
                        actual: fact.value,
                        sourceIds: [fact.evidenceId],
                        explanation:
                          "Reassessed by the shared seller rules using an authoritative exact-product fact.",
                      }
                    : {}),
                }
              : check;
          },
        ),
      };
      await ctx.db.patch(row._id, {
        data: {
          ...row.data,
          fit,
          ...(!hardPass
            ? { requirementsValidExceptBudget: false, selectable: false }
            : {}),
        },
        card: {
          ...row.card,
          fit,
          evidenceStatus: status,
          evidenceIds: evidence.map((e) => e.id),
          mainConcern: contradicted
            ? "An authoritative exact-product fact contradicts this offer; revalidation is required."
            : status === "unavailable"
              ? "Applicable independent and owner evidence is unavailable. Demo product facts are synthetic."
              : "Read exact-variant and family source applicability before deciding.",
        },
      });
    }
  await emit(
    ctx,
    runId,
    "research_updated",
    status === "unavailable"
      ? "Applicable source evidence is unavailable; no review or rating was invented."
      : "Applicable source evidence was attached with provenance and retrieval dates.",
  );
}
