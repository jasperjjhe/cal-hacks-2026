import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approve,
  confirmationError,
  dateInput,
  initialState,
  matchingOffers,
  parseDollars,
  reserve,
  restoreState,
  sendMessage,
} from "../src/buyer/mock.ts";

const now = 1792861200000;
function confirmed() {
  const draft = sendMessage(
    initialState(),
    "I need a laptop, my budget is $1,000.",
  );
  return {
    ...draft,
    deadline: dateInput(now + 5 * 86400000),
    confirmed: true,
    runStartedAt: now,
    page: "results",
    journey: "results",
  };
}
test("mock requires explicit budget/date and target consent before a run", () => {
  assert.ok(confirmationError(initialState(), now));
  const state = confirmed();
  assert.equal(confirmationError(state, now), null);
  assert.equal(
    confirmationError({ ...state, deadline: dateInput(now) }, now),
    null,
  );
  assert.ok(
    confirmationError({ ...state, shareTarget: true, target: "1001" }, now),
  );
  assert.equal(parseDollars("0.29"), 29);
  assert.equal(parseDollars("1.234"), null);
  assert.equal(parseDollars("1e3"), null);
});
test("mock matching respects delivered ceiling, condition and arrival without relaxing requirements", () => {
  const state = confirmed();
  assert.equal(matchingOffers(state, now).length, 3);
  assert.equal(
    matchingOffers({ ...state, allowRefurbished: false }, now).length,
    2,
  );
  assert.equal(matchingOffers({ ...state, budget: "500" }, now).length, 0);
  assert.equal(
    matchingOffers({ ...state, deadline: dateInput(now + 86400000) }, now)
      .length,
    1,
  );
  const edited = sendMessage(state, "Only new, please");
  assert.equal(edited.confirmed, false);
  assert.equal(edited.runStartedAt, null);
  assert.equal(edited.version, state.version + 1);
});
test("mock quote expires after three minutes and approval retries produce one order", () => {
  const state = reserve(confirmed(), "b-p3", now);
  assert.equal(state.quote.expiresAt, now + 180000);
  assert.equal(
    reserve(state, "b-p3", now + 1000).quote.expiresAt,
    state.quote.expiresAt,
  );
  assert.throws(() => approve(state, now + 180000), /expired/);
  assert.throws(
    () => approve({ ...state, version: state.version + 1 }, now),
    /changed/,
  );
  const completed = approve(state, now + 1000);
  assert.equal(completed.orders.length, 1);
  assert.equal(approve(completed, now + 200000).orders.length, 1);
  assert.throws(() => reserve(completed, "a-p3", now + 2000), /already/);
  assert.deepEqual(restoreState(JSON.stringify(completed)), completed);
  assert.equal(restoreState("{broken").page, "home");
});
test("unsupported category stays a draft and non-tech fixtures contain no borrowed evidence", () => {
  const state = sendMessage(initialState(), "Find me a holiday package");
  assert.equal(state.category, "unsupported");
  assert.ok(confirmationError(state, now));
  const clothing = { ...confirmed(), category: "clothing", budget: "40" };
  assert.ok(
    matchingOffers(clothing, now).every(
      (offer) => offer.source === null && offer.image === null,
    ),
  );
});
