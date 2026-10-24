/// <reference types="vite/client" />
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  await t.mutation(internal.sellerSeed.seedSellerDemo, {
    seedRevision: "buyer-v1",
  });
  const buyer = t.withIdentity({ subject: "buyer-a|session-a" });
  return { t, buyer };
}
async function confirmed(context?: Awaited<ReturnType<typeof setup>>) {
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
          requirements: [
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
        urls: ["https://example.com/exact-product"],
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
