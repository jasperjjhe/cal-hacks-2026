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
  const result = await state.buyer.mutation(internal.buyerMutations.startRun, {
    input: { request: state.ref, clientKey: "start" },
  });
  for (let i = 0; i < 150; i++) {
    await state.t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(100);
    const view = await state.buyer.query(api.buyer.getBuyerRun, {
      requestId: state.ref.id,
      runId: result.runId,
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
        runId,
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
