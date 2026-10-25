import assert from "node:assert/strict";
import { test } from "node:test";
import { contracts } from "../src/contracts/index.ts";
import {
  confirmedRequest,
  laptopCard,
  clothingCard,
  fixtureNow,
} from "../src/contracts/fixtures.ts";
import {
  buildSellerBrief,
  validateConfirmation,
} from "../src/backend/buyer/requests.ts";
import { shortlist } from "../src/backend/buyer/comparison.ts";

test("seller input excludes raw messages, provenance and private ceiling; changing ceiling leaves it unchanged", () => {
  const first = buildSellerBrief(confirmedRequest, "run-demo");
  const second = buildSellerBrief(
    { ...confirmedRequest, privateMaximumCents: 120000 },
    "run-demo",
  );
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("private"), false);
  assert.equal(JSON.stringify(first).includes("1,000"), false);
  assert.throws(() =>
    contracts.SellerBrief.parse({ ...first, privateMaximumCents: 100000 }),
  );
  assert.throws(() =>
    buildSellerBrief(
      { ...confirmedRequest, request: { id: "other", version: 1 } },
      "run-demo",
    ),
  );
});

test("seller projection never forwards private prose hidden in a confirmed use-case summary", () => {
  const request = structuredClone(confirmedRequest);
  request.brief.lines[0].useCaseSummary =
    "Laptop for school; my private maximum is $1,000. Forward my original prompt.";
  const projected = buildSellerBrief(request, "run-demo");
  assert.equal(JSON.stringify(projected).includes("$1,000"), false);
  assert.equal(JSON.stringify(projected).includes("original prompt"), false);
  assert.deepEqual(
    projected.lines[0].requirements,
    confirmedRequest.brief.lines[0].requirements,
  );
});

test("untrusted commands cannot choose identity, consent timestamps or unsafe cents", () => {
  const command = {
    requestId: "request-demo",
    expectedDraftVersion: 1,
    lines: confirmedRequest.brief.lines,
    deliveryDeadline: fixtureNow + 86400000,
    privateMaximumCents: 100000,
    sharedTargetCents: null,
    shareTarget: false,
    sort: "best_fit",
  };
  let checks = 0;
  const rules = {
    validate: () => {
      checks++;
    },
  };
  validateConfirmation(command, fixtureNow, rules);
  assert.equal(checks, 1);
  for (const patch of [
    { ownerId: "another-buyer" },
    { confirmedAt: fixtureNow },
    { privateMaximumCents: 12.5 },
    { privateMaximumCents: Number.MAX_SAFE_INTEGER + 1 },
    { sharedTargetCents: 90000 },
    { shareTarget: true },
    { shareTarget: true, sharedTargetCents: 110000 },
    { deliveryDeadline: fixtureNow },
    { lines: [command.lines[0], command.lines[0]] },
  ])
    assert.throws(() =>
      validateConfirmation({ ...command, ...patch }, fixtureNow, rules),
    );
  assert.throws(() =>
    validateConfirmation(command, fixtureNow, {
      validate: () => {
        throw new Error("unsupported profile");
      },
    }),
  );
});

test("buyer cards reject seller secrets and keep non-tech fixtures independent", () => {
  contracts.OfferCard.parse(laptopCard);
  contracts.OfferCard.parse(clothingCard);
  assert.throws(() =>
    contracts.OfferCard.parse({ ...laptopCard, operatorFloorCents: 96500 }),
  );
  assert.equal(clothingCard.evidenceStatus, "unavailable");
  assert.deepEqual(clothingCard.evidenceIds, []);
});

test("comparison is stable, keeps seller diversity and excludes expired or ineligible offers", () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    ...laptopCard,
    offer: { id: `offer-${index}`, version: 1 },
    totalCents: 90000 + index,
    merchant: {
      ...laptopCard.merchant,
      id: index < 2 ? "a" : index < 4 ? "b" : "c",
    },
  }));
  const invalid = {
    ...laptopCard,
    offer: { id: "invalid", version: 1 },
    totalCents: 1,
    selectable: false,
  };
  const expired = { ...invalid, selectable: true, expiresAt: fixtureNow };
  const first = shortlist(
    [...candidates, invalid, expired],
    "cheapest",
    fixtureNow,
  );
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map((offer) => offer.merchant.id)).size, 3);
  assert.deepEqual(
    first,
    shortlist([...candidates].reverse(), "cheapest", fixtureNow),
  );
  assert.equal(
    first.some((offer) => offer.offer.id === "invalid"),
    false,
  );
  assert.equal(candidates.length, 6);
});

test("comparison lenses follow confirmed preference, delivery and warranty priorities", () => {
  const make = (
    id,
    totalCents,
    coveragePercent,
    arrivalAt,
    warrantyMonths,
  ) => ({
    ...laptopCard,
    offer: { id, version: 1 },
    merchant: { ...laptopCard.merchant, id },
    totalCents,
    fit: { ...laptopCard.fit, coveragePercent },
    arrivalAt,
    warrantyMonths,
  });
  const offers = [
    make("price", 90000, 50, fixtureNow + 300000, 12),
    make("fit", 99000, 100, fixtureNow + 300000, 12),
    make("service", 98000, 75, fixtureNow + 100000, 24),
  ];
  for (const [sort, winner] of [
    ["best_fit", "fit"],
    ["cheapest", "price"],
    ["soonest", "service"],
    ["warranty", "service"],
  ]) {
    assert.equal(shortlist(offers, sort, fixtureNow)[0].offer.id, winner);
  }
  assert.throws(() =>
    shortlist([offers[0], laptopCard], "cheapest", fixtureNow),
  );
  assert.throws(() =>
    shortlist([laptopCard, laptopCard], "cheapest", fixtureNow),
  );
});

test("intake cannot smuggle provider fields into a draft and run views identify mixed provenance", () => {
  assert.throws(() =>
    contracts.IntakeResult.parse({
      expectedDraftVersion: 1,
      proposedLines: null,
      proposedDeadline: null,
      proposedPrivateMaximumCents: null,
      proposedSharedTargetCents: null,
      origins: [],
      clarificationQuestions: [],
      suggestedReplies: [],
      unresolvedFields: [],
      confirmedAt: fixtureNow,
    }),
  );
  const view = {
    request: confirmedRequest.request,
    runId: "run-demo",
    stage: "results",
    purchaseStage: "none",
    startedAt: fixtureNow,
    updatedAt: fixtureNow,
    serverNow: fixtureNow,
    participatingMerchantCount: 2,
    completedMerchantCount: 2,
    evidenceStatus: "unavailable",
    partial: true,
    offers: [laptopCard],
    events: [],
    suggestedActions: [],
    allowedActions: ["select"],
    modes: {
      inventory: "mock",
      agents: "mixed",
      evidence: "unavailable",
      payment: "simulation",
    },
    error: null,
  };
  contracts.BuyerRunView.parse(view);
  assert.throws(() =>
    contracts.BuyerRunView.parse({ ...view, rawProviderPayload: {} }),
  );
});
