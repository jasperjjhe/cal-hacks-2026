/// <reference types="vite/client" />
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import * as buyerTools from "../convex/integrations/buyerTools";
import { contracts } from "../src/contracts";
import { fixtureCouncil, envelope } from "../convex/buyer/council";
import { makeValidProposal } from "../convex/lib/sellerFixtures";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  await t.mutation(internal.sellerSeed.seedSellerDemo, {
    seedRevision: "buyer-v1",
  });
  const buyer = t.withIdentity({ subject: "buyer-a|session-a" });
  return { t, buyer };
}
async function confirmed(context?: Awaited<ReturnType<typeof setup>>, noRequirements = false) {
  const { t, buyer } = context ?? (await setup());
  const draft = await buyer.mutation(internal.buyerMutations.saveDraft, {
    input: {
      requestId: null,
      expectedDraftVersion: null,
      message: "Windows laptop under $1200 by 2026-11-30",
    },
  });
  const ref = await buyer.mutation(internal.buyerMutations.confirmRequest, {
    input: {
      requestId: draft.requestId,
      expectedDraftVersion: 1,
      lines: [
        {
          lineId: "main",
          role: "primary",
          category: "laptop",
          profile: { id: "profile_laptop", version: 1 },
          quantity: 1,
          allowedConditions: ["new", "refurbished"],
          requirements: noRequirements ? [] : [
            {
              id: "os",
              fieldId: "osFamily",
              operator: "equals",
              value: "Windows",
              unit: null,
              strength: "hard",
              weight: 1,
            },
          ],
          useCaseSummary: "One laptop.",
        },
      ],
      deliveryDeadline: Date.now() + 20 * 86400000,
      privateMaximumCents: 120000,
      sharedTargetCents: null,
      shareTarget: false,
      sort: "best_fit",
    },
  });
  return { t, buyer, draft, ref };
}
async function resultRun(context?: Awaited<ReturnType<typeof setup>>) {
  const state = await confirmed(context);
  await state.buyer.mutation(internal.buyerMutations.startRun, {
    input: { request: state.ref, clientKey: "start" },
  });
  for (let i = 0; i < 150; i++) {
    await state.t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(100);
    const view = await state.buyer.query(api.buyer.getBuyerRun, {
      requestId: state.ref.id,
    });
    if (["results", "no_match", "failed"].includes(view.stage))
      return { ...state, view };
  }
  throw new Error("Workflow did not finish");
}
test("live buyer mode keeps seller payloads local and labels the run mixed", async () => {
  const base = await setup();
  await base.t.mutation(internal.buyerAdmin.configureDemo, { agents: "live" });
  const invoke = vi.spyOn(buyerTools, "invokeCreao").mockImplementation(async (job) => {
    expect(["moderator_brief", "moderator_adjudication"]).toContain(job.role);
    expect(JSON.stringify(job.input)).not.toContain("operatorFloorCents");
    expect(JSON.stringify(job.input)).not.toContain("privateMaximumCents");
    return { status: "completed", providerRunId: "live-moderator-test", model: null,
      output: fixtureCouncil(job.input as import("../src/contracts").Contract<"CouncilJobInput">) };
  });
  const state = await resultRun(base);
  expect(state.view.stage).toBe("results");
  expect(state.view.modes.agents).toBe("mixed");
  expect(invoke).toHaveBeenCalled();
  const jobs = await base.t.run(ctx => ctx.db.query("buyerJobs").collect());
  expect(jobs.filter(job => job.role.startsWith("seller_")).every(job => job.provider === "fixture")).toBe(true);
});
test("request ownership, stale writes and private brief isolation", async () => {
  const { t, buyer, draft, ref } = await confirmed();
  await expect(
    t
      .withIdentity({ subject: "buyer-b|session-b" })
      .query(api.buyer.getDraft, { requestId: draft.requestId }),
  ).rejects.toThrow();
  await expect(
    buyer.mutation(internal.buyerMutations.saveDraft, {
      input: {
        requestId: draft.requestId,
        expectedDraftVersion: 99,
        message: "changed",
      },
    }),
  ).rejects.toThrow();
  const { runId } = await buyer.mutation(internal.buyerMutations.startRun, {
    input: { request: ref, clientKey: "start" },
  });
  await buyer.mutation(internal.buyerJobs.preparePhase, {
    runId,
    phase: "bidding",
  });
  const jobs = await t.run((ctx) => ctx.db.query("buyerJobs").collect());
  expect(jobs.length).toBeGreaterThan(0);
  for (const job of jobs) {
    expect(JSON.stringify(job.input)).not.toContain("privateMaximumCents");
    expect(JSON.stringify(job.input)).not.toContain("under $1200");
  }
});
test("durable workflow publishes checked offers and one idempotent simulated order", async () => {
  const { t, buyer, ref, view } = await resultRun();
  expect(view.stage).toBe("results");
  expect(view.offers.length).toBeGreaterThan(1);
  const quote = await buyer.mutation(internal.buyerMutations.selectAndReserve, {
    input: {
      request: ref,
      runId: view.runId,
      offer: view.offers[0].offer,
      clientKey: "select",
    },
  });
  const input = {
    request: ref,
    quoteId: quote.quoteId,
    quoteHash: quote.quoteHash,
    clientKey: "approve",
  };
  const execution = await buyer.mutation(
    internal.buyerMutations.approveAndExecute,
    { input },
  );
  const repeated = await buyer.mutation(
    internal.buyerMutations.approveAndExecute,
    { input },
  );
  expect(repeated.executionId).toBe(execution.executionId);
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  const purchase = await buyer.query(api.buyer.getPurchase, {
    requestId: ref.id,
  });
  expect(purchase.execution?.status).toBe("succeeded");
  expect(purchase.execution?.resultMessage).toBe(
    "Demo order completed; no payment taken.",
  );
  expect(await buyer.query(api.buyer.listOrders, {})).toHaveLength(1);
});

async function reserve(
  state: Awaited<ReturnType<typeof resultRun>>,
  key = "select",
) {
  return state.buyer.mutation(internal.buyerMutations.selectAndReserve, {
    input: {
      request: state.ref,
      runId: state.view.runId,
      offer: state.view.offers[0].offer,
      clientKey: key,
    },
  });
}
async function approveQuote(
  state: Awaited<ReturnType<typeof resultRun>>,
  quote: Awaited<ReturnType<typeof reserve>>,
  key = "approve",
) {
  return state.buyer.mutation(internal.buyerMutations.approveAndExecute, {
    input: {
      request: state.ref,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      clientKey: key,
    },
  });
}
test("expired quotes reject approval and release only unapproved holds", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  await vi.advanceTimersByTimeAsync(180001);
  await state.t.finishInProgressScheduledFunctions();
  await expect(approveQuote(state, quote)).rejects.toThrow();
  const allocations = await state.t.run((ctx) =>
    ctx.db.query("allocations").collect(),
  );
  expect(allocations.every((a) => a.state === "released")).toBe(true);
  expect(await state.buyer.query(api.buyer.listOrders, {})).toHaveLength(0);
});
test("unknown execution retains stock beyond quote expiry and reconciles the same attempt", async () => {
  const state = await resultRun();
  await state.t.run((ctx) =>
    ctx.db.insert("buyerSettings", {
      key: "paymentScenario",
      value: "unknown_then_success",
    }),
  );
  const quote = await reserve(state);
  const execution = await approveQuote(state, quote);
  const claim = await state.t.mutation(internal.buyerExecution.claimAttempt, {
    executionId: execution.executionId,
    reconcile: false,
  });
  expect(claim).not.toBeNull();
  await state.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: execution.executionId,
    status: "unknown",
    providerReference: "simulation:unknown",
  });
  vi.setSystemTime(Date.now() + 180001);
  await state.t.mutation(internal.buyerExecution.expireQuote, {
    quoteId: quote.quoteId,
  });
  expect(
    (await state.t.run((ctx) => ctx.db.query("allocations").collect())).every(
      (a) => a.state === "execution_locked",
    ),
  ).toBe(true);
  await expect(
    state.buyer.mutation(internal.buyerMutations.cancelRun, {
      input: { request: state.ref, runId: state.view.runId },
    }),
  ).rejects.toThrow();
  await state.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: execution.executionId,
    status: "succeeded",
    providerReference: "simulation:unknown",
  });
  await state.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: execution.executionId,
    status: "succeeded",
    providerReference: "simulation:unknown",
  });
  expect(await state.buyer.query(api.buyer.listOrders, {})).toHaveLength(1);
});
test("decline releases all allocations and allows a fresh selection", async () => {
  const state = await resultRun();
  await state.t.run((ctx) =>
    ctx.db.insert("buyerSettings", {
      key: "paymentScenario",
      value: "declined",
    }),
  );
  const quote = await reserve(state);
  await approveQuote(state, quote);
  await state.t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(1);
  await state.t.finishInProgressScheduledFunctions();
  expect(
    (
      await state.buyer.query(api.buyer.getPurchase, {
        requestId: state.ref.id,
      })
    ).execution?.status,
  ).toBe("declined");
  expect(
    (await state.t.run((ctx) => ctx.db.query("allocations").collect())).every(
      (a) => a.state === "released",
    ),
  ).toBe(true);
  expect((await reserve(state, "fresh")).quoteId).not.toBe(quote.quoteId);
});
test("failed selection swap rolls back release of the previous hold", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  const other = state.view.offers.find((o) => o.offer.id !== quote.offer.id)!;
  await state.t.run(async (ctx) => {
    const row = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", state.view.runId).eq("effective", true),
      )
      .filter((q) => q.eq(q.field("data.offer.id"), other.offer.id))
      .first();
    const listing = await ctx.db
      .query("listingVersions")
      .withIndex("by_listingId_and_version", (q) =>
        q.eq("listingId", row!.data.lines[0].listing.id),
      )
      .first();
    await ctx.db.patch(listing!._id, { enabled: false });
  });
  await expect(
    state.buyer.mutation(internal.buyerMutations.selectAndReserve, {
      input: {
        request: state.ref,
        runId: state.view.runId,
        offer: other.offer,
        clientKey: "bad-swap",
      },
    }),
  ).rejects.toThrow();
  const purchase = await state.buyer.query(api.buyer.getPurchase, {
    requestId: state.ref.id,
  });
  expect(purchase.quote?.quoteId).toBe(quote.quoteId);
  expect(purchase.quoteState).toBe("reserved");
});
test("changed exact product facts require renewed approval, and quote hashes are enforced", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  await expect(
    state.buyer.mutation(internal.buyerMutations.approveAndExecute, {
      input: {
        request: state.ref,
        quoteId: quote.quoteId,
        quoteHash: "forged",
        clientKey: "forged",
      },
    }),
  ).rejects.toThrow();
  await state.t.run(async (ctx) => {
    const row = await ctx.db
      .query("buyerQuotes")
      .filter((q) => q.eq(q.field("_id"), quote.quoteId))
      .first();
    const variantId = row!.products[0].variantId;
    const variant = await ctx.db
      .query("variants")
      .withIndex("by_variantId", (q) => q.eq("variantId", variantId))
      .unique();
    await ctx.db.patch(variant!._id, { title: "Changed exact configuration" });
  });
  await expect(approveQuote(state, quote)).rejects.toThrow();
  expect(await state.buyer.query(api.buyer.listOrders, {})).toHaveLength(0);
});
test("cancellation makes late worker completions inert", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(
    internal.buyerMutations.startRun,
    { input: { request: state.ref, clientKey: "start" } },
  );
  const ids = await state.buyer.mutation(internal.buyerJobs.preparePhase, {
    runId,
    phase: "bidding",
  });
  await state.buyer.mutation(internal.buyerMutations.cancelRun, {
    input: { request: state.ref, runId },
  });
  for (const jobId of ids)
    await state.t.action(internal.buyerJobs.dispatch, { jobId });
  expect(
    (
      await state.buyer.query(api.buyer.getBuyerRun, {
        requestId: state.ref.id,
      })
    ).stage,
  ).toBe("cancelled");
  expect(
    await state.t.run((ctx) => ctx.db.query("buyerOffers").collect()),
  ).toHaveLength(0);
});
test("public commands return structured errors without committing partial stock changes", async () => {
  const state = await resultRun();
  const result = (await state.buyer.action(api.buyer.approveAndExecute, {
    input: {
      request: state.ref,
      quoteId: "missing",
      quoteHash: "nope",
      clientKey: "bad",
    },
  })) as { ok: boolean; error: { code: string } };
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe("FORBIDDEN");
  expect(
    await state.t.run((ctx) => ctx.db.query("buyerExecutions").collect()),
  ).toHaveLength(0);
});

test("two buyers cannot reserve the same last unit", async () => {
  const first = await resultRun();
  const listing = await first.t.run(async (ctx) => {
    const row = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", first.view.runId).eq("effective", true),
      )
      .filter((q) =>
        q.eq(q.field("data.offer.id"), first.view.offers[0].offer.id),
      )
      .first();
    const id = row!.data.lines[0].listing.id;
    const stock = await ctx.db
      .query("listingVersions")
      .withIndex("by_listingId_and_version", (q) => q.eq("listingId", id))
      .order("desc")
      .first();
    await ctx.db.patch(stock!._id, { initialQuantity: 1 });
    return id;
  });
  const second = await resultRun({
    t: first.t,
    buyer: first.t.withIdentity({ subject: "buyer-b|session-b" }),
  });
  const result = await Promise.allSettled([reserve(first), reserve(second)]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const allocations = await first.t.run((ctx) =>
    ctx.db
      .query("allocations")
      .withIndex("by_listingId_and_state", (q) =>
        q.eq("listingId", listing).eq("state", "reserved"),
      )
      .collect(),
  );
  expect(allocations.reduce((sum, a) => sum + a.quantity, 0)).toBe(1);
});
test("canonical unit conversion uses the shared seller unit registry", async () => {
  const { buyer, draft } = await confirmed();
  const ref = await buyer.mutation(internal.buyerMutations.confirmRequest, {
    input: {
      requestId: draft.requestId,
      expectedDraftVersion: 1,
      lines: [
        {
          lineId: "main",
          role: "primary",
          category: "laptop",
          profile: { id: "profile_laptop", version: 1 },
          quantity: 1,
          allowedConditions: ["new"],
          requirements: [
            {
              id: "weight",
              fieldId: "weightG",
              operator: "max",
              value: 1.5,
              unit: "kg",
              strength: "hard",
              weight: 1,
            },
          ],
          useCaseSummary: "Laptop",
        },
      ],
      deliveryDeadline: Date.now() + 10 * 86400000,
      privateMaximumCents: 200000,
      sharedTargetCents: null,
      shareTarget: false,
      sort: "best_fit",
    },
  });
  const request = await buyer.query(api.buyer.getConfirmedRequest, {
    requestId: ref.id,
  });
  expect(request?.brief.lines[0].requirements[0]).toMatchObject({
    value: 1500,
    unit: "g",
  });
});
test("final price submissions stay sealed until the round closes", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(
    internal.buyerMutations.startRun,
    { input: { request: state.ref, clientKey: "start" } },
  );
  const jobs = await state.t.mutation(internal.buyerJobs.preparePhase, {
    runId,
    phase: "bidding",
  });
  for (const jobId of jobs)
    await state.t.action(internal.buyerJobs.dispatch, { jobId });
  await state.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("buyerRuns", runId)!;
    await ctx.db.patch(id, { stage: "negotiating" });
  });
  const roundId = await state.t.mutation(
    internal.buyerWorkflow.openPriceRound,
    { runId },
  );
  expect(roundId).not.toBeNull();
  const finals = await state.t.mutation(internal.buyerJobs.preparePhase, {
    runId,
    phase: "negotiating",
    roundId: roundId!,
  });
  for (const jobId of finals) {
    const job = await state.t.query(internal.buyerJobs.getJob, { jobId });
    for (const field of [
      "privateMaximumCents",
      "affordable",
      "rawMessages",
      "origins",
    ])
      expect(JSON.stringify(job!.input)).not.toContain(field);
  }
  await state.t.action(internal.buyerJobs.dispatch, { jobId: finals[0] });
  const staged = await state.t.run((ctx) =>
    ctx.db
      .query("buyerOffers")
      .filter((q) => q.eq(q.field("stagedRoundId"), roundId))
      .collect(),
  );
  expect(staged.length).toBeGreaterThan(0);
  expect(staged.every((o) => !o.effective)).toBe(true);
  const events = await state.buyer.query(api.buyer.getRunEvents, {
    requestId: state.ref.id,
    cursor: null,
  });
  expect(events.events.filter((e) => e.kind === "final_bid")).toHaveLength(0);
});
test("one retry is bounded and cannot repair stale work", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(
    internal.buyerMutations.startRun,
    { input: { request: state.ref, clientKey: "start" } },
  );
  const [jobId] = await state.t.mutation(internal.buyerJobs.preparePhase, {
    runId,
    phase: "bidding",
  });
  const repair = await state.t.mutation(internal.buyerJobs.createRepair, {
    jobId,
  });
  expect(repair).not.toBeNull();
  expect(
    await state.t.mutation(internal.buyerJobs.createRepair, { jobId: repair! }),
  ).toBeNull();
  await state.buyer.mutation(internal.buyerMutations.cancelRun, {
    input: { request: state.ref, runId },
  });
  expect(
    await state.t.mutation(internal.buyerJobs.createRepair, { jobId }),
  ).toBeNull();
});
test("source provenance rejects a mismatched extraction build and guessed evidence reads", async () => {
  const state = await resultRun();
  const id = await state.t.run(async (ctx) => {
    await ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.view.runId)!, {
      stage: "researching",
    });
    return ctx.db.insert("buyerResearch", {
      runId: state.view.runId,
      variantId: "P5",
      digest: "digest",
      state: "acquiring",
      providerRunId: "expected",
      providerBuild: "pinned-build",
      input: { urls: ["https://example.com/product"], syntheticProduct: false },
      deadlineAt: Date.now() + 60000,
      createdAt: Date.now(),
    });
  });
  await expect(
    state.t.mutation(internal.buyerEvidence.complete, {
      researchJobId: String(id),
      result: {
        status: "completed",
        providerRunId: "expected",
        build: "wrong-build",
        evidence: [],
      },
    }),
  ).rejects.toThrow();
  expect(
    await state.buyer.query(api.buyer.getEvidence, {
      requestId: state.ref.id,
      evidenceIds: ["guessed-id"],
    }),
  ).toEqual([]);
});
test("retention removes private completed data but preserves sold stock and unresolved attempts", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  const execution = await approveQuote(state, quote);
  await state.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: execution.executionId,
    status: "succeeded",
    providerReference: "simulation:done",
  });
  vi.setSystemTime(Date.now() + 8 * 86400000);
  const outcome = await state.t.mutation(internal.buyerMaintenance.retain, {});
  expect(outcome.deleted).toBe(1);
  expect(
    await state.t.run((ctx) => ctx.db.query("buyerRequests").collect()),
  ).toHaveLength(0);
  expect(
    (await state.t.run((ctx) => ctx.db.query("allocations").collect())).every(
      (a) => a.state === "sold",
    ),
  ).toBe(true);
  const pending = await resultRun();
  const held = await reserve(pending);
  const attempt = await approveQuote(pending, held);
  await pending.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: attempt.executionId,
    status: "unknown",
    providerReference: "simulation:pending",
  });
  vi.setSystemTime(Date.now() + 8 * 86400000);
  expect(
    (await pending.t.mutation(internal.buyerMaintenance.retain, {})).deleted,
  ).toBe(0);
  expect(
    (
      await pending.buyer.query(api.buyer.getPurchase, {
        requestId: pending.ref.id,
      })
    ).execution?.status,
  ).toBe("unknown");
});

test("all non-tech categories and a related-item basket complete through the actual workflow", async () => {
  const cases = [
    {
      category: "clothing",
      profile: "profile_clothing",
      requirements: [
        {
          id: "color",
          fieldId: "color",
          operator: "equals",
          value: "navy",
          unit: null,
          strength: "hard",
          weight: 1,
        },
      ],
    },
    {
      category: "household_accessory",
      profile: "profile_household_accessory",
      requirements: [],
    },
    {
      category: "small_appliance",
      profile: "profile_small_appliance",
      requirements: [
        {
          id: "plug",
          fieldId: "plugRegion",
          operator: "equals",
          value: "US",
          unit: null,
          strength: "hard",
          weight: 1,
        },
      ],
    },
    { category: "laptop", profile: "profile_laptop", requirements: [] },
  ];
  for (const example of cases) {
    const { t, buyer } = await setup();
    const draft = await buyer.mutation(internal.buyerMutations.saveDraft, {
      input: {
        requestId: null,
        expectedDraftVersion: null,
        message: `Need a ${example.category}`,
      },
    });
    const lines = [
      {
        lineId: "main",
        role: "primary",
        category: example.category,
        profile: { id: example.profile, version: 1 },
        quantity: 1,
        allowedConditions: ["new"],
        requirements: example.requirements,
        useCaseSummary: "Confirmed product requirements.",
      },
      ...(example.category === "laptop"
        ? [
            {
              lineId: "mouse",
              role: "related",
              category: "tech_accessory",
              profile: { id: "profile_tech_accessory", version: 1 },
              quantity: 2,
              allowedConditions: ["new"],
              requirements: [],
              useCaseSummary: "Compatible data accessory.",
            },
          ]
        : []),
    ];
    const ref = await buyer.mutation(internal.buyerMutations.confirmRequest, {
      input: {
        requestId: draft.requestId,
        expectedDraftVersion: 1,
        lines,
        deliveryDeadline: Date.now() + 20 * 86400000,
        privateMaximumCents: 500000,
        sharedTargetCents: null,
        shareTarget: false,
        sort: "best_fit",
      },
    });
    await buyer.mutation(internal.buyerMutations.startRun, {
      input: { request: ref, clientKey: "start" },
    });
    let stage = "";
    for (let i = 0; i < 150; i++) {
      await t.finishInProgressScheduledFunctions();
      await vi.advanceTimersByTimeAsync(100);
      const view = await buyer.query(api.buyer.getBuyerRun, {
        requestId: ref.id,
      });
      stage = view.stage;
      if (["results", "failed", "no_match"].includes(stage)) {
        expect(stage).toBe("results");
        expect(view.offers.length).toBeGreaterThan(0);
        if (example.category === "laptop")
          expect(view.offers[0].products).toHaveLength(2);
        break;
      }
    }
    expect(stage).toBe("results");
  }
});
test("authoritative exact-product contradictions invoke shared assessment and prevent selection", async () => {
  const state = await resultRun();
  const row = await state.t.run(async (ctx) => {
    await ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.view.runId)!, {
      stage: "researching",
    });
    const offer = await ctx.db
      .query("buyerOffers")
      .withIndex("by_run_effective", (q) =>
        q.eq("runId", state.view.runId).eq("effective", true),
      )
      .first();
    const variant = await ctx.db
      .query("variants")
      .withIndex("by_variantId", (q) =>
        q.eq("variantId", offer!.card.products[0].variantId),
      )
      .unique();
    await ctx.db.patch(variant!._id, { syntheticProduct: false });
    const id = await ctx.db.insert("buyerResearch", {
      runId: state.view.runId,
      variantId: variant!.variantId,
      digest: "known-input",
      state: "acquiring",
      providerRunId: "expected",
      providerBuild: "pinned",
      input: {
        domains: ["example.com"],
        syntheticProduct: false,
      },
      deadlineAt: Date.now() + 60000,
      createdAt: Date.now(),
    });
    return { id, variantId: variant!.variantId, offer: offer!.data.offer };
  });
  await state.t.mutation(internal.buyerEvidence.complete, {
    researchJobId: String(row.id),
    result: {
      status: "completed",
      providerRunId: "expected",
      build: "pinned",
      evidence: [
        {
          id: "source-1",
          variantId: row.variantId,
          applicability: "exact_variant",
          sourceType: "manufacturer",
          url: "https://example.com/exact-product",
          sourceDate: null,
          retrievedAt: Date.now(),
          claim: "This exact product has a different OS.",
          excerpt: "The source identifies Linux.",
          sourceVerifiedPurchaseLabel: null,
          verification: "contradicted",
          providerRunId: "expected",
          providerBuild: "pinned",
          duplicateGroup: "manufacturer",
        },
      ],
      facts: [
        {
          evidenceId: "source-1",
          fieldId: "osFamily",
          value: "Linux",
          unit: null,
        },
      ],
    },
  });
  await state.t.mutation(internal.buyerWorkflow.publishResults, {
    runId: state.view.runId,
  });
  const view = await state.buyer.query(api.buyer.getBuyerRun, {
    requestId: state.ref.id,
  });
  expect(
    view.offers.some((o) => o.products[0].variantId === row.variantId),
  ).toBe(false);
  await expect(
    state.buyer.mutation(internal.buyerMutations.selectAndReserve, {
      input: {
        request: state.ref,
        runId: state.view.runId,
        offer: row.offer,
        clientKey: "blocked",
      },
    }),
  ).rejects.toThrow();
});

test("canonical run reads and cursor pagination are owned and bounded", async () => {
  const state = await confirmed();
  expect(
    await state.buyer.query(api.buyer.getBuyerRun, { requestId: state.ref.id }),
  ).toBeNull();
  expect(
    await state.buyer.query(api.buyer.getRunEvents, {
      requestId: state.ref.id,
      cursor: null,
    }),
  ).toEqual({ events: [], nextCursor: null });
  const { runId } = await state.buyer.mutation(
    internal.buyerMutations.startRun,
    { input: { request: state.ref, clientKey: "start" } },
  );
  await state.t.run(async (ctx) => {
    for (let sequence = 2; sequence <= 105; sequence++) {
      const id = await ctx.db.insert("buyerEvents", {
        runId,
        sequence,
        data: null,
      });
      await ctx.db.patch(id, {
        data: {
          id: String(id),
          request: state.ref,
          runId,
          sequence,
          createdAt: Date.now(),
          kind: "response",
          merchantId: null,
          offer: null,
          summary: "Safe event",
        },
      });
    }
  });
  const first = await state.buyer.query(api.buyer.getRunEvents, {
    requestId: state.ref.id,
    cursor: null,
  });
  expect(first.events).toHaveLength(100);
  expect(first.nextCursor).not.toBeNull();
  const second = await state.buyer.query(api.buyer.getRunEvents, {
    requestId: state.ref.id,
    cursor: first.nextCursor,
  });
  expect(second.events).toHaveLength(5);
  expect(second.nextCursor).toBeNull();
  expect(second.events[0].sequence).toBe(101);
  await expect(
    state.buyer.query(api.buyer.getRunEvents, {
      requestId: state.ref.id,
      cursor: "other-run.10",
    }),
  ).rejects.toThrow();
  await expect(
    state.t
      .withIdentity({ subject: "other|session" })
      .query(api.buyer.getRunEvents, {
        requestId: state.ref.id,
        cursor: first.nextCursor,
      }),
  ).rejects.toThrow();
});
test("refreshing a comparison releases its old quote without losing the confirmed version", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  const fresh = await state.buyer.mutation(internal.buyerMutations.startRun, {
    input: { request: state.ref, clientKey: "refresh" },
  });
  expect(fresh.runId).not.toBe(state.view.runId);
  expect(
    (
      await state.buyer.query(api.buyer.getPurchase, {
        requestId: state.ref.id,
      })
    ).quoteState,
  ).toBe("released");
  await expect(approveQuote(state, quote)).rejects.toThrow();
  expect(
    (
      await state.buyer.query(api.buyer.getConfirmedRequest, {
        requestId: state.ref.id,
      })
    )?.request,
  ).toEqual(state.ref);
});

test("diagnostic migration preserves a locked purchase snapshot and never resets stock", async () => {
  const state = await resultRun();
  await state.t.run(async (ctx) => {
    for (const row of await ctx.db.query("listingVersions").collect())
      if (/^P[1-6]$/.test(row.variantId))
        await ctx.db.patch(row._id, { diagnosticAttributes: {} });
  });
  const quote = await reserve(state);
  const execution = await approveQuote(state, quote);
  const first = await state.t.mutation(
    internal.buyerAdmin.upgradeDemoDiagnostics,
    {},
  );
  expect(first.updated).toBeGreaterThan(0);
  expect(
    (await state.t.mutation(internal.buyerAdmin.upgradeDemoDiagnostics, {}))
      .updated,
  ).toBe(0);
  expect(
    (await state.t.run((ctx) => ctx.db.query("allocations").collect())).every(
      (a) => a.state === "execution_locked",
    ),
  ).toBe(true);
  await state.t.mutation(internal.buyerExecution.settleAttempt, {
    executionId: execution.executionId,
    status: "succeeded",
    providerReference: "simulation:approved-snapshot",
  });
  const orders = await state.buyer.query(api.buyer.listOrders, {});
  expect(orders).toHaveLength(1);
  expect(orders[0].quote).toEqual(quote);
  expect(
    (await state.t.run((ctx) => ctx.db.query("allocations").collect())).every(
      (a) => a.state === "sold",
    ),
  ).toBe(true);
});


// Review regressions exercise public transactions and durable job boundaries.
async function biddingReady(noRequirements = false) {
  const state = await confirmed(undefined, noRequirements);
  const { runId } = await state.buyer.mutation(internal.buyerMutations.startRun, { input: { request: state.ref, clientKey: "start" } });
  const jobs = await state.t.mutation(internal.buyerJobs.preparePhase, { runId, phase: "bidding" });
  for (const jobId of jobs)
    await state.t.action(internal.buyerJobs.dispatch, { jobId });
  return { ...state, runId, jobs };
}
test("interrupted approved payments recover the same attempt without executing again", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  const execution = await approveQuote(state, quote);
  const claim = await state.t.mutation(internal.buyerExecution.claimAttempt, { executionId: execution.executionId, reconcile: false });
  expect(claim).not.toBeNull();
  const attempt = await state.t.query(internal.buyerExecution.getAttempt, { executionId: execution.executionId });
  vi.setSystemTime(Date.now() + 60001);
  await state.t.mutation(internal.buyerExecution.recoverAttempt, { executionId: execution.executionId, claimedAt: attempt!.updatedAt });
  expect((await state.t.query(internal.buyerExecution.getAttempt, { executionId: execution.executionId }))!.state).toBe("unknown");
  expect(await state.t.mutation(internal.buyerExecution.claimAttempt, { executionId: execution.executionId, reconcile: false })).toBeNull();
  await state.t.action(internal.buyerExecution.reconcileAttempt, { executionId: execution.executionId });
  expect((await state.t.query(internal.buyerExecution.getAttempt, { executionId: execution.executionId }))!.state).toBe("succeeded");
  expect(await state.buyer.query(api.buyer.listOrders, {})).toHaveLength(1);
});
test("approval recovery also covers actions that never reach their first claim", async () => {
  const state = await resultRun();
  const execution = await approveQuote(state, await reserve(state));
  vi.setSystemTime(Date.now() + 60001);
  expect(await state.t.mutation(internal.buyerExecution.recoverStalledAttempts, {})).toBe(1);
  expect((await state.t.query(internal.buyerExecution.getAttempt, { executionId: execution.executionId }))!.state).toBe("unknown");
});
test("an unresolved attempt after thirty declines prevents another reservation", async () => {
  const state = await resultRun();
  const quote = await reserve(state);
  const execution = await approveQuote(state, quote);
  await state.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("buyerExecutions", execution.executionId)!;
    const attempt = (await ctx.db.get(id))!;
    const { _id, _creationTime, ...fields } = attempt;
    void _creationTime;
    await ctx.db.delete(_id);
    for (let i = 0; i < 30; i++)
      await ctx.db.insert("buyerExecutions", { ...fields, state: "declined" });
    await ctx.db.insert("buyerExecutions", { ...fields, state: "unknown" });
  });
  await expect(reserve(state, "second-purchase")).rejects.toThrow();
});
test("exact token memberships survive new sessions through internal account grants", async () => {
  const { t, buyer } = await setup();
  await expect(buyer.mutation(api.seller.bindOperatorSession, {})).rejects.toThrow();
  await t.mutation(internal.buyerAdmin.assignMembership, { userId: "operator-a", merchantId: "merchant_a" });
  const first = t.withIdentity({ subject: "operator-a|one", tokenIdentifier: "issuer|operator-a|one" });
  const second = t.withIdentity({ subject: "operator-a|two", tokenIdentifier: "issuer|operator-a|two" });
  await first.mutation(api.seller.bindOperatorSession, {});
  await expect(second.query(api.seller.getMerchantView, {})).rejects.toThrow();
  await second.mutation(api.seller.bindOperatorSession, {});
  await first.query(api.seller.getMerchantView, {});
  await second.query(api.seller.getMerchantView, {});
  await expect(t.withIdentity({ subject: "other|one", tokenIdentifier: "issuer|other|one" }).mutation(api.seller.bindOperatorSession, {})).rejects.toThrow();
  const memberships = await t.run(ctx => ctx.db.query("memberships").withIndex("by_authTokenIdentifier", q => q.eq("authTokenIdentifier", "issuer|operator-a|two")).collect());
  expect(memberships).toHaveLength(1);
  expect(memberships[0].merchantId).toBe("merchant_a");
});
test("legacy memberships migrate idempotently without granting access by a subject prefix", async () => {
  const { t } = await setup();
  await t.run(ctx => ctx.db.insert("memberships", {
    authSubject: "legacy-operator", merchantId: "merchant_a", role: "operator", enabled: true, createdAt: Date.now()
  }));
  const operator = t.withIdentity({
    subject: "legacy-operator|session", tokenIdentifier: "issuer|legacy-operator|session"
  });
  await expect(operator.query(api.seller.getMerchantView, {})).rejects.toThrow();
  expect((await t.mutation(internal.buyerAdmin.migrateOperatorMemberships, {})).migrated).toBe(1);
  expect((await t.mutation(internal.buyerAdmin.migrateOperatorMemberships, {})).migrated).toBe(0);
  await operator.mutation(api.seller.bindOperatorSession, {});
  await operator.query(api.seller.getMerchantView, {});
});
test("seller listing publication creates a clean current version and rejects stale updates", async () => {
  const { t } = await setup();
  const operator = t.withIdentity({ subject: "operator|session", tokenIdentifier: "issuer|operator|session" });
  await t.mutation(internal.buyerAdmin.assignMembership, { userId: "operator", merchantId: "merchant_a" });
  await operator.mutation(api.seller.bindOperatorSession, {});
  const listing = { id: "merchant_a:P3", version: 1 };
  const updated = await operator.mutation(api.seller.updateOwnListing, { listing, patch: { referenceUnitCents: 98000 } });
  expect(updated.listing.version).toBe(2);
  await expect(operator.mutation(api.seller.updateOwnListing, { listing, patch: { referenceUnitCents: 99000 } })).rejects.toThrow();
  const versions = await t.run(ctx => ctx.db.query("listingVersions").withIndex("by_listingId_and_version", q => q.eq("listingId", listing.id)).collect());
  expect(versions.filter(v => v.enabled)).toHaveLength(1);
  expect(versions.find(v => v.version === 2)!.referenceUnitCents).toBe(98000);
});
test("moderator repair output remains usable by the v2 council", async () => {
  const state = await biddingReady();
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.runId)!, { stage: "council" }));
  await state.t.mutation(internal.buyerRoles.freezeCompetition, { runId: state.runId });
  const [jobId] = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "brief" });
  const child = (await state.t.mutation(internal.buyerJobs.createRepair, { jobId }))!;
  await state.t.action(internal.buyerJobs.dispatch, { jobId: child });
  await state.t.mutation(internal.buyerJobs.finishRepair, { jobId });
  const parent = await state.t.query(internal.buyerJobs.getJob, { jobId });
  expect(contracts.ModeratorBrief.safeParse(parent!.output).success).toBe(true);
  await state.t.mutation(internal.buyerRoles.closeCouncilPhase, { runId: state.runId, phase: "brief" });
  expect((await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "advocacy" })).length).toBeGreaterThan(1);
});
test("a peer challenge targeting the second candidate reaches the target's grouped reply", async () => {
  const state = await biddingReady(true);
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.runId)!, { stage: "council" }));
  await state.t.mutation(internal.buyerRoles.freezeCompetition, { runId: state.runId });
  await councilPhase(state, "brief");
  const advocacy = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "advocacy" });
  const job = (await state.t.query(internal.buyerJobs.getJob, { jobId: advocacy[0] }))!;
  const input = contracts.CouncilJobInput.parse(job.input);
  const rival = input.competition.offers.find(o => o.merchantId !== job.merchantId)!;
  const targets = input.competition.offers.filter(o => o.merchantId === rival.merchantId);
  expect(targets.length).toBeGreaterThan(1);
  const target = targets[1];
  const fact = input.facts.find(f => f.offer.id === target.offer.id)!;
  await state.t.mutation(internal.buyerJobs.claimJob, { jobId: advocacy[0], poll: false });
  await state.t.mutation(internal.buyerJobs.completeJob, { jobId: advocacy[0], result: { status: "completed", providerRunId: "test", model: null,
    output: { ...envelope(input), phase: "advocacy", defenses: [], challenge: { targetOffer: target.offer, claimId: null, factId: fact.id, question: "Check this fact", sourceIds: [] } } } });
  for (const id of advocacy.slice(1)) await state.t.action(internal.buyerJobs.dispatch, { jobId: id });
  await state.t.mutation(internal.buyerRoles.closeCouncilPhase, { runId: state.runId, phase: "advocacy" });
  const replies = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "reply" });
  const jobs = await Promise.all(replies.map(jobId => state.t.query(internal.buyerJobs.getJob, { jobId })));
  const reply = jobs.find(j => j!.merchantId === rival.merchantId)!;
  expect(reply.input.challenges.some((c: {challenge: {targetOffer: {id:string}}}) => c.challenge.targetOffer.id === target.offer.id)).toBe(true);
  expect(jobs.filter(j => j!.merchantId === rival.merchantId)).toHaveLength(1);
});
test("final jobs share the round deadline and late responses never replace earlier offers", async () => {
  const state = await biddingReady();
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.runId)!, { stage: "negotiating" }));
  const roundId = (await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId }))!;
  expect(roundId).not.toBeNull();
  const round = await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerRounds", roundId)!));
  vi.setSystemTime(Date.now() + 20000);
  const finals = await state.t.mutation(internal.buyerJobs.preparePhase, { runId: state.runId, phase: "negotiating", roundId });
  expect(finals.length).toBeGreaterThan(0);
  const first = (await state.t.query(internal.buyerJobs.getJob, { jobId: finals[0] }))!;
  expect(first.deadlineAt).toBe(round!.data.deadlineAt);
  vi.setSystemTime(round!.data.deadlineAt + 1);
  await state.t.action(internal.buyerJobs.dispatch, { jobId: finals[0] });
  const submissions = await state.t.run(ctx => ctx.db.query("buyerSubmissions").withIndex("by_round_candidate", q => q.eq("roundId", roundId)).collect());
  expect(submissions).toHaveLength(0);
  await state.t.mutation(internal.buyerWorkflow.closePriceRound, { runId: state.runId, roundId });
});
test("paused merchants cannot create artificial competition or receive new final jobs", async () => {
  const state = await biddingReady();
  await state.t.run(async (ctx) => {
    await ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.runId)!, { stage: "negotiating" });
    const merchants = await ctx.db.query("merchants").collect();
    for (const merchant of merchants.slice(1))
      await ctx.db.patch(merchant._id, { paused: true });
  });
  // Without a shared target a single active merchant cannot open competition.
  expect(await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId })).toBeNull();
});
test("ambiguous provider starts poll the same job and never create a repair start", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(internal.buyerMutations.startRun, { input: { request: state.ref, clientKey: "start" } });
  const [jobId] = await state.t.mutation(internal.buyerJobs.preparePhase, { runId, phase: "bidding" });
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerJobs", jobId)!, { provider: "creao" }));
  const start = vi.spyOn(buyerTools, "invokeCreao").mockRejectedValue(new Error("Timeout after provider accepted"));
  const poll = vi.spyOn(buyerTools, "pollCreao").mockResolvedValue({ status: "pending", providerRunId: "recovered-remote-id" });
  expect(await state.t.action(internal.buyerJobs.dispatch, { jobId })).toEqual({ pending: true });
  await state.t.action(internal.buyerJobs.dispatch, { jobId, poll: true });
  expect(start).toHaveBeenCalledTimes(1);
  expect(poll).toHaveBeenCalledWith(expect.objectContaining({ id: jobId, providerRunId: null }));
  const job = await state.t.query(internal.buyerJobs.getJob, { jobId });
  expect(job!.state).toBe("pending");
  expect(job!.output?.repairJobId).toBeUndefined();
});
test("invalid repaired bids become provider failures rather than a no-supply result", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(internal.buyerMutations.startRun, { input: { request: state.ref, clientKey: "start" } });
  const jobs = await state.t.mutation(internal.buyerJobs.preparePhase, { runId, phase: "bidding" });
  for (const jobId of jobs) {
    const child = (await state.t.mutation(internal.buyerJobs.createRepair, { jobId }))!;
    const job = (await state.t.mutation(internal.buyerJobs.claimJob, { jobId: child, poll: false }))!;
    const proposal = {
      ...makeValidProposal(job.merchantId!), jobId: job.sellerJobId!, candidateId: job.candidateId!, policy: job.input.policy.policy
    };
    proposal.lines = proposal.lines.map(l => ({ ...l, unitCents: 1 }));
    await state.t.mutation(internal.buyerJobs.completeJob, {
      jobId: child, result: {
        status: "completed", providerRunId: "remote", model: null, output: { kind: "propose", proposal }
      }
    });
    await state.t.mutation(internal.buyerJobs.finishRepair, { jobId });
  }
  await state.t.mutation(internal.buyerWorkflow.closeBidding, { runId });
  const view = await state.buyer.query(api.buyer.getBuyerRun, { requestId: state.ref.id });
  expect(view.stage).toBe("failed");
  expect(view.error!.retryable).toBe(true);
});
test("confirmation rejects scalar membership predicates before freezing a request", async () => {
  const state = await confirmed();
  const request = (await state.buyer.query(api.buyer.getConfirmedRequest, { requestId: state.ref.id }))!;
  const line = {
    ...request.brief.lines[0], requirements: request.brief.lines[0].requirements.map(r => ({ ...r, operator: "in", value: "Windows" }))
  };
  const draft = await state.buyer.mutation(internal.buyerMutations.saveDraft, {
    input: { requestId: null, expectedDraftVersion: null, message: "Another laptop" }
  });
  await expect(state.buyer.mutation(internal.buyerMutations.confirmRequest, {
    input: {
      requestId: draft.requestId, expectedDraftVersion: 1, lines: [line], deliveryDeadline: Date.now() + 20 * 86400000, privateMaximumCents: 120000, sharedTargetCents: null, shareTarget: false, sort: "best_fit"
    }
  })).rejects.toThrow();
});
test("saved evidence retains its original run and cannot be read across owners", async () => {
  const state = await resultRun();
  const card = state.view.offers[0];
  await state.buyer.mutation(internal.buyerMutations.toggleSaved, { input: { requestId: state.ref.id, offer: card.offer } });
  const evidenceId = "archived-excerpt";
  await state.t.run(ctx => ctx.db.insert("buyerEvidence", {
    runId: state.view.runId, variantId: card.products[0].variantId, digest: "archived-input", retrievedAt: Date.now(), facts: [],
    data: {
      id: evidenceId, variantId: card.products[0].variantId, applicability: "family", sourceType: "independent_test", url: "https://example.com/source", sourceDate: null, retrievedAt: Date.now(), claim: "Archived source", excerpt: "Original request source", sourceVerifiedPurchaseLabel: null, verification: "unknown", providerRunId: "archived-provider", providerBuild: "pinned", duplicateGroup: "archived"
    },
  }));
  const [saved] = await state.buyer.query(api.buyer.listSaved, {});
  expect(saved.requestId).toBe(state.ref.id);
  expect(saved.runId).toBe(state.view.runId);
  await state.buyer.mutation(internal.buyerMutations.startRun, { input: { request: state.ref, clientKey: "refresh-saved" } });
  expect(await state.buyer.query(api.buyer.getEvidence, { requestId: state.ref.id, runId: saved.runId!, evidenceIds: [evidenceId] })).toEqual([
    expect.objectContaining({ id: evidenceId, excerpt: "Original request source" })
  ]);
  await expect(state.t.withIdentity({ subject: "other|session" }).query(api.buyer.getEvidence, { requestId: state.ref.id, runId: saved.runId!, evidenceIds: [] })).rejects.toThrow();
  await state.t.run(ctx => ctx.db.delete(ctx.db.normalizeId("buyerRuns", state.view.runId)!));
  const [expired] = await state.buyer.query(api.buyer.listSaved, {});
  expect(expired.requestId).toBeNull();
  expect(expired.runId).toBeNull();
  expect(expired.card.offer).toEqual(card.offer);
});
test("accessory-first baskets normalize the primary identity and reserve repeated stock lines", async () => {
  const base = await confirmed();
  const original = (await base.buyer.query(api.buyer.getConfirmedRequest, { requestId: base.ref.id }))!;
  const draft = await base.buyer.mutation(internal.buyerMutations.saveDraft, {
    input: { requestId: null, expectedDraftVersion: null, message: "Laptop and two mice" }
  });
  const accessory = {
    lineId: "mouse-a", role: "related", category: "tech_accessory", profile: { id: "profile_tech_accessory", version: 1 }, quantity: 1, allowedConditions: ["new"], requirements: [], useCaseSummary: "Mouse"
  };
  const ref = await base.buyer.mutation(internal.buyerMutations.confirmRequest, {
    input: {
      requestId: draft.requestId, expectedDraftVersion: 1, lines: [accessory, original.brief.lines[0], { ...accessory, lineId: "mouse-b" }], deliveryDeadline: Date.now() + 20 * 86400000, privateMaximumCents: 120000, sharedTargetCents: null, shareTarget: false, sort: "best_fit"
    }
  });
  const request = (await base.buyer.query(api.buyer.getConfirmedRequest, { requestId: ref.id }))!;
  expect(request.brief.lines[0].role).toBe("primary");
  const { runId } = await base.buyer.mutation(internal.buyerMutations.startRun, { input: { request: ref, clientKey: "start-basket" } });
  for (let i = 0; i < 150; i++) {
    await base.t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(100);
    const view = await base.buyer.query(api.buyer.getBuyerRun, { requestId: ref.id });
    if (view.stage !== "results")
      continue;
    expect(view.offers[0].products).toHaveLength(3);
    expect(view.offers[0].products[0].requestLineId).toBe("main");
    const quote = await base.buyer.mutation(internal.buyerMutations.selectAndReserve, {
      input: {
        request: ref, runId, offer: view.offers[0].offer, clientKey: "basket-reserve"
      }
    });
    expect(quote.lines).toHaveLength(3);
    const allocations = await base.t.run(ctx => ctx.db.query("allocations").collect());
    expect(allocations.filter(a => a.listingId.endsWith(":MOUSE")).reduce((sum, a) => sum + a.quantity, 0)).toBe(2);
    const research = await base.t.run(ctx => ctx.db.query("buyerResearch").withIndex("by_run", q => q.eq("runId", runId)).collect());
    expect(research.every(j => j.variantId !== "MOUSE")).toBe(true);
    return;
  }
  throw new Error("Basket did not reach results");
});
test.each([false, true])("conflicting authoritative facts block selection in either result order (%s)", async (reverse) => {
  const state = await resultRun();
  const target = await state.t.run(async (ctx) => {
    await ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.view.runId)!, { stage: "researching" });
    const row = (await ctx.db.query("buyerOffers").withIndex("by_run_effective", q => q.eq("runId", state.view.runId).eq("effective", true)).first())!;
    const variant = (await ctx.db.query("variants").withIndex("by_variantId", q => q.eq("variantId", row.card.products[0].variantId)).unique())!;
    await ctx.db.patch(variant._id, { syntheticProduct: false });
    const id = await ctx.db.insert("buyerResearch", {
      runId: state.view.runId, variantId: variant.variantId, digest: "conflict-input", state: "acquiring", providerRunId: "remote", providerBuild: "pinned", input: {
        domains: ["example.com"], syntheticProduct: false
      }, deadlineAt: Date.now() + 60000, createdAt: Date.now()
    });
    return { id, variantId: variant.variantId, offerId: row._id };
  });
  const facts = ["Linux", "Windows"].map((value, i) => ({ evidenceId: `fact-${i}`, fieldId: "osFamily", value, unit: null }));
  const evidence = facts.map((fact, i) => ({
    id: fact.evidenceId, variantId: target.variantId, applicability: "exact_variant", sourceType: "manufacturer", url: `https://example.com/${i ? "b" : "a"}`, sourceDate: null, retrievedAt: Date.now(), claim: fact.value, excerpt: `OS is ${fact.value}`, sourceVerifiedPurchaseLabel: null, verification: "supported", providerRunId: "remote", providerBuild: "pinned", duplicateGroup: `group-${i}`
  }));
  await state.t.mutation(internal.buyerEvidence.complete, {
    researchJobId: String(target.id), result: {
      status: "completed", providerRunId: "remote", build: "pinned", evidence, facts: reverse ? facts.reverse() : facts
    }
  });
  const offer = await state.t.run(ctx => ctx.db.get(target.offerId));
  expect(offer!.data.selectable).toBe(false);
  expect(offer!.data.requirementsValidExceptBudget).toBe(false);
});
test("a merchant paused after job preparation is rejected before provider dispatch", async () => {
  const state = await confirmed();
  const { runId } = await state.buyer.mutation(internal.buyerMutations.startRun, { input: { request: state.ref, clientKey: "pause-dispatch" } });
  const [jobId] = await state.t.mutation(internal.buyerJobs.preparePhase, { runId, phase: "bidding" });
  const job = (await state.t.query(internal.buyerJobs.getJob, { jobId }))!;
  await state.t.run(async (ctx) => {
    const merchant = (await ctx.db.query("merchants").withIndex("by_merchantId", q => q.eq("merchantId", job.merchantId!)).unique())!;
    await ctx.db.patch(merchant._id, { paused: true });
  });
  expect(await state.t.mutation(internal.buyerJobs.claimJob, { jobId, poll: false })).toBeNull();
  expect((await state.t.query(internal.buyerJobs.getJob, { jobId }))!.state).toBe("cancelled");
});
test("round deadline remains authoritative even when a worker record has a later deadline", async () => {
  const state = await biddingReady();
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerRuns", state.runId)!, { stage: "negotiating" }));
  const roundId = (await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId }))!;
  const [jobId] = await state.t.mutation(internal.buyerJobs.preparePhase, { runId: state.runId, phase: "negotiating", roundId });
  await state.t.mutation(internal.buyerJobs.claimJob, { jobId, poll: false });
  const round = await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerRounds", roundId)!));
  await state.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("buyerJobs", jobId)!, { deadlineAt: round!.data.deadlineAt + 30000 }));
  vi.setSystemTime(round!.data.deadlineAt + 1);
  await state.t.mutation(internal.buyerJobs.completeJob, {
    jobId, result: {
      status: "completed", providerRunId: "late", model: null, output: { kind: "abstain", jobId: "irrelevant", reasonCode: "NO_MATCH" }
    }
  });
  expect((await state.t.query(internal.buyerJobs.getJob, { jobId }))!.state).toBe("stale");
  const submissions = await state.t.run(ctx => ctx.db.query("buyerSubmissions").withIndex("by_round_candidate", q => q.eq("roundId", roundId)).collect());
  expect(submissions).toHaveLength(0);
});

async function councilPhase(state: Awaited<ReturnType<typeof biddingReady>>, phase: import("../src/contracts").Contract<"CouncilPhase">) {
  const jobs = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase });
  for (const jobId of jobs) await state.t.action(internal.buyerJobs.dispatch, { jobId });
  await state.t.mutation(internal.buyerRoles.closeCouncilPhase, { runId: state.runId, phase });
  return jobs;
}

async function frozenCouncil() {
  const state = await biddingReady();
  await state.t.mutation(internal.buyerWorkflow.closeBidding, { runId: state.runId });
  const councilId = (await state.t.mutation(internal.buyerRoles.freezeCompetition, { runId: state.runId }))!;
  const council = (await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerCouncils", councilId)!)))!;
  return { ...state, councilId, council };
}
async function finishCouncil(state: Awaited<ReturnType<typeof frozenCouncil>>) {
  for (const phase of ["brief", "advocacy", "reply", "adjudication"] as const) await councilPhase(state, phase);
}
test("frozen public snapshot and all eligible final invitations ignore the private ceiling", async () => {
  const state = await frozenCouncil();
  const wire = JSON.stringify(state.council.snapshot);
  for (const key of ["affordable", "selectable", "privateMaximumCents", "rawMessages", "origins", "operatorFloorCents", "unitCost", "privatePriceRationale"])
    expect(wire).not.toContain(key);
  const snapshot = structuredClone(state.council.snapshot);
  await state.t.run(async ctx => {
    const version = (await ctx.db.query("buyerRequestVersions").collect())[0];
    await ctx.db.patch(version._id, { data: { ...version.data, privateMaximumCents: 1 } });
    for (const row of await ctx.db.query("buyerOffers").collect())
      await ctx.db.patch(row._id, { data: { ...row.data, affordable: false } });
  });
  await finishCouncil(state);
  const roundId = (await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId }))!;
  const round = (await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerRounds", roundId)!)))!;
  expect(round.data.participants).toHaveLength(snapshot.offers.length);
  expect((await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerCouncils", state.councilId)!)))!.snapshot).toEqual(snapshot);
});



test("missing grouped replies and moderator accusations cannot invalidate eligible offers", async () => {
  const state = await frozenCouncil();
  await councilPhase(state, "brief"); await councilPhase(state, "advocacy");
  const replyIds = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "reply" });
  for (const jobId of replyIds) await state.t.mutation(internal.buyerJobs.failJob, { jobId });
  await state.t.mutation(internal.buyerRoles.closeCouncilPhase, { runId: state.runId, phase: "reply" });
  const [jobId] = await state.t.mutation(internal.buyerRoles.prepareCouncilJobs, { runId: state.runId, phase: "adjudication" });
  const job = (await state.t.query(internal.buyerJobs.getJob, { jobId }))!;
  const output = fixtureCouncil(job.input) as import("../src/contracts").Contract<"ModeratorAdjudication">;
  output.outcomes.forEach(o => { o.finding = "contradicted"; o.summary = "Reject this rival!"; });
  await state.t.mutation(internal.buyerJobs.claimJob, { jobId, poll: false });
  await state.t.mutation(internal.buyerJobs.completeJob, { jobId, result: { status: "completed", providerRunId: "test", model: null, output } });
  await state.t.mutation(internal.buyerRoles.closeCouncilPhase, { runId: state.runId, phase: "adjudication" });
  const council = (await state.t.run(ctx => ctx.db.get(ctx.db.normalizeId("buyerCouncils", state.councilId)!)))!;
  expect(council.outcomes.every((o: {finding:string}) => o.finding === "unknown")).toBe(true);
  const offers = await state.t.run(ctx => ctx.db.query("buyerOffers").collect());
  expect(offers.filter(o => o.effective).every(o => o.data.requirementsValidExceptBudget)).toBe(true);
  expect((await state.buyer.query(api.buyer.getBuyerRun, { requestId: state.ref.id })).partial).toBe(true);
});


test("all sealed revisions stay private until the final round closes", async () => {
  const state = await frozenCouncil(); await finishCouncil(state);
  const roundId = (await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId }))!;
  const ids = await state.t.mutation(internal.buyerJobs.preparePhase, { runId: state.runId, phase: "negotiating", roundId });
  for (const jobId of ids) {
    const job = (await state.t.query(internal.buyerJobs.getJob, { jobId }))!;
    expect(contracts.SellerFinalJobInput.safeParse(job.input.sellerInput).success).toBe(true);
    for (const key of ["affordable", "privateMaximumCents", "operatorFloorCents", "unitCostByListing"])
      expect(JSON.stringify(job.input.sellerInput)).not.toContain(key);
  }
  const before = await state.t.run(ctx => ctx.db.query("buyerOffers").filter(q => q.eq(q.field("effective"), true)).collect());
  await state.t.action(internal.buyerJobs.dispatch, { jobId: ids[0] });
  const during = await state.t.run(ctx => ctx.db.query("buyerOffers").filter(q => q.eq(q.field("effective"), true)).collect());
  expect(during.map(o => o.data.totalCents)).toEqual(before.map(o => o.data.totalCents));
  const events = await state.buyer.query(api.buyer.getRunEvents, { requestId: state.ref.id, cursor: null });
  expect(events.events.some(e => e.kind === "final_bid")).toBe(false);
  for (const jobId of ids.slice(1)) await state.t.action(internal.buyerJobs.dispatch, { jobId });
  await state.t.mutation(internal.buyerWorkflow.closePriceRound, { runId: state.runId, roundId });
  const after = await state.t.run(ctx => ctx.db.query("buyerOffers").filter(q => q.eq(q.field("effective"), true)).collect());
  expect(after.some(o => o.data.totalCents < before.find(b => b.candidateId === o.candidateId)!.data.totalCents)).toBe(true);
  const view = await state.buyer.query(api.buyer.getBuyerRun, { requestId: state.ref.id });
  expect(view.finalStatus.received).toBe(ids.length);
});

test("final revisions reject changed quantities, substituted listings and ungranted service upgrades", async () => {
  const state = await frozenCouncil(); await finishCouncil(state);
  const roundId = (await state.t.mutation(internal.buyerWorkflow.openPriceRound, { runId: state.runId }))!;
  const [jobId] = await state.t.mutation(internal.buyerJobs.preparePhase, { runId: state.runId, phase: "negotiating", roundId });
  const job = (await state.t.query(internal.buyerJobs.getJob, { jobId }))!;
  const parent = job.input.parentOffer;
  const proposal = { schemaVersion: 2, jobId: job.sellerJobId, candidateId: job.candidateId, parentOffer: parent.offer,
    policy: parent.policy, lines: parent.lines, claims: [], fitArgument: "Improved offer", privatePriceRationale: "test", serviceOptionId: null };
  await state.t.mutation(internal.buyerJobs.claimJob, { jobId, poll: false });
  for (const patched of [
    { ...proposal, lines: proposal.lines.map((l: {quantity:number}) => ({ ...l, quantity: l.quantity + 1 })) },
    { ...proposal, lines: proposal.lines.map((l: object) => ({ ...l, listing: { id: "another-listing", version: 1 } })) },
    { ...proposal, serviceOptionId: "not-granted" },
    { ...proposal, parentOffer: { id: "foreign-parent", version: 1 } },
  ]) await expect(state.t.mutation(internal.buyerJobs.completeJob, { jobId, result: { status: "completed", providerRunId: "test", model: null,
    output: { ...job.input.finalBinding, decision: { kind: "propose", proposal: patched } } } })).rejects.toThrow();
  expect(await state.t.run(ctx => ctx.db.query("buyerSubmissions").collect())).toHaveLength(0);
});

test("genuine offered products queue automatic discovery without curated URLs", async () => {
  vi.stubEnv('BUYER_EVIDENCE_REGISTRY', JSON.stringify({
    actorId: '3ox4R101TgZz67sLr', build: 'pinned', buildNumber: '1.0.33',
    reddit: { build: 'reddit-build', buildNumber: '0.0.750', community: 'SonyHeadphones' }
  }));
  try {
    const state = await resultRun();
    await state.t.run(async ctx => {
      const run = (await ctx.db.get(ctx.db.normalizeId('buyerRuns', state.view.runId)!))!;
      await ctx.db.patch(run._id, { stage: 'researching', config: { ...run.config, researchDeadlineAt: Date.now() + 60000 } });
      for (const job of await ctx.db.query('buyerResearch').withIndex('by_run', q => q.eq('runId', state.view.runId)).collect()) await ctx.db.delete(job._id);
      const offer = (await ctx.db.query('buyerOffers').withIndex('by_run_effective', q => q.eq('runId', state.view.runId).eq('effective', true)).first())!;
      const variant = (await ctx.db.query('variants').withIndex('by_variantId', q => q.eq('variantId', offer.card.products[0].variantId)).unique())!;
      await ctx.db.patch(variant._id, { syntheticProduct: false, title: 'Sony WH-1000XM5 - Black' });
    });
    await state.t.mutation(internal.buyerEvidence.prepareResearch, { runId: state.view.runId });
    const jobs = await state.t.run(ctx => ctx.db.query('buyerResearch').withIndex('by_run', q => q.eq('runId', state.view.runId)).collect());
    const job = jobs.find(j => j.input.productName === 'Sony WH-1000XM5 - Black');
    expect(job?.state).toBe('queued');
    expect(job?.input.query).toBe('Sony WH-1000XM5 review');
    expect(job?.input.urls).toBeUndefined();
    expect(job?.input.domains).toContain('reddit.com');
    expect(jobs.filter(j => j.variantId === job?.variantId)).toHaveLength(2);
    expect(jobs.find(j => j.variantId === job?.variantId && j.input.provider === 'reddit')?.input.community).toBe('SonyHeadphones');
  } finally { vi.unstubAllEnvs(); }
});

test.each([false, true])('one failed evidence provider preserves the other provider sources (%s)', async (failedFirst) => {
  const state = await resultRun();
  const target = await state.t.run(async ctx => {
    await ctx.db.patch(ctx.db.normalizeId('buyerRuns', state.view.runId)!, { stage: 'researching' });
    const offer = (await ctx.db.query('buyerOffers').withIndex('by_run_effective', q => q.eq('runId', state.view.runId).eq('effective', true)).first())!;
    const ids = [];
    for (const provider of ['web', 'reddit']) ids.push(await ctx.db.insert('buyerResearch', {
      runId: state.view.runId, variantId: offer.card.products[0].variantId, digest: provider, state: 'acquiring',
      providerRunId: provider, providerBuild: provider, input: { domains: ['reddit.com'], syntheticProduct: false }, deadlineAt: Date.now() + 60000, createdAt: Date.now()
    }));
    return { ids, offerId: offer._id, variantId: offer.card.products[0].variantId };
  });
  const result = { status: 'completed', providerRunId: 'web', build: 'web', evidence: [{
    id: 'retained-comment', variantId: target.variantId, applicability: 'family', sourceType: 'owner_report',
    url: 'https://reddit.com/r/SonyHeadphones/comments/abc/discussion/comment/', sourceDate: null, retrievedAt: Date.now(),
    claim: 'Owner anecdote', excerpt: 'An actual comment excerpt.', sourceVerifiedPurchaseLabel: null,
    verification: 'unknown', providerRunId: 'web', providerBuild: 'web', duplicateGroup: 'thread'
  }] };
  for (const i of failedFirst ? [1, 0] : [0, 1]) await state.t.mutation(internal.buyerEvidence.complete, {
    researchJobId: String(target.ids[i]), result: i === 0 ? result : { status: 'unavailable' }
  });
  const offer = await state.t.run(ctx => ctx.db.get(target.offerId));
  expect(offer?.card.evidenceIds).toContain('retained-comment');
  expect(offer?.card.evidenceStatus).toBe('partial');
});
