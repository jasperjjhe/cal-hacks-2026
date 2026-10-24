import { test } from "node:test";
import assert from "node:assert/strict";
import * as mock from "../src/buyer/mock.ts";

const now = Date.parse("2026-10-24T19:00:00Z");
function ready() {
  return {
    ...mock.sendMessage(mock.initialState(), "Laptop under $1000"),
    page: "results",
    journey: "results",
    confirmed: true,
    runStartedAt: now,
    deadline: "2026-10-29",
  };
}

test("reject selection before results are finalized", () => {
  assert.throws(() =>
    mock.reserve(
      { ...ready(), page: "progress", journey: "progress" },
      "b-p3",
      now + 1,
    ),
  );
});
test("recheck delivery from the selection date rather than the old run date", () => {
  const state = { ...ready(), deadline: "2026-10-25" };
  assert.throws(
    () => mock.reserve(state, "b-p3", now + 2 * 86400000),
    /deliver|match|deadline/i,
  );
});
test("typed suggested replies update the same proposed preference", () => {
  assert.equal(
    mock.sendMessage(ready(), "Battery first").preference,
    "Battery first",
  );
});
test("revisions clear previous permission to share a negotiation target", () => {
  const state = { ...ready(), shareTarget: true, target: "900" };
  const revised = mock.sendMessage(state, "Under $950 now");
  assert.equal(revised.shareTarget, false);
  assert.equal(revised.target, "");
});
test("today remains a valid confirmed date even when no sample can arrive today", () => {
  const state = { ...ready(), deadline: "2026-10-24" };
  assert.equal(mock.confirmationError(state, now), null);
  assert.deepEqual(mock.matchingOffers(state, now), []);
});
test("failed modal selection preserves an existing valid quote", () => {
  const state = mock.reserve(ready(), "b-p3", now);
  assert.throws(() => mock.reserve(state, "missing-offer", now + 1));
  assert.equal(state.quote.offerId, "b-p3");
});

test("workspace navigation resumes the current journey and checking completes off-screen", () => {
  const running = mock.beginRun({ ...ready(), confirmed: false }, now);
  const settings = mock.navigate(running, "settings", now + 1000);
  assert.equal(settings.journey, "progress");
  const completed = mock.tickRun(settings, now + mock.runDurationMs);
  assert.equal(completed.page, "settings");
  assert.equal(mock.navigate(completed, "chat", now + 10000).page, "results");
  const quote = mock.reserve(ready(), "b-p3", now);
  assert.equal(
    mock.navigate(mock.navigate(quote, "home", now), "chat", now).page,
    "approval",
  );
  assert.equal(
    mock.navigate(mock.navigate(quote, "home", now), "chat", now).quote.quoteId,
    quote.quote.quoteId,
  );
});

test("editing a confirmed brief clears consent while editing the new consent target preserves it", () => {
  const state = { ...ready(), shareTarget: true, target: "900" };
  const revised = mock.reviseDraft(state, { budget: "950" });
  assert.equal(revised.shareTarget, false);
  assert.equal(revised.target, "");
  assert.equal(revised.journey, "chat");
  const consented = mock.reviseDraft(revised, { shareTarget: true });
  assert.equal(
    mock.reviseDraft(consented, { target: "850" }).shareTarget,
    true,
  );
});

test("calendar delivery dates survive spring/fall clock changes in San Francisco", () => {
  // 23:30 before spring-forward: 24 elapsed hours would land on March 9.
  assert.equal(
    mock.deliveryDate(Date.parse("2026-03-08T07:30:00Z"), 1),
    "2026-03-08",
  );
  // 00:30 before fall-back: 24 elapsed hours would still land on November 1.
  assert.equal(
    mock.deliveryDate(Date.parse("2026-11-01T07:30:00Z"), 1),
    "2026-11-02",
  );
  assert.match(mock.dateOnlyLabel("2026-11-02"), /Nov 2/);
  assert.ok(
    mock.confirmationError({ ...ready(), deadline: "2026-02-30" }, now),
  );
  assert.equal(mock.money(4050), "$40.50");
});

test("quote/order terms are snapshots and changed catalog terms require renewed approval", () => {
  const quoted = mock.reserve(ready(), "b-p3", now);
  const entry = mock.catalog.find((offer) => offer.id === "b-p3");
  const previous = entry.warranty;
  try {
    entry.warranty = 6;
    assert.equal(quoted.quote.offerSnapshot.warranty, 24);
    assert.throws(() => mock.approve(quoted, now + 1000), /changed/);
  } finally {
    entry.warranty = previous;
  }
  const completed = mock.approve(quoted, now + 1000);
  assert.equal(
    completed.orders[0].offerSnapshot.title,
    quoted.quote.offerSnapshot.title,
  );
  assert.equal(completed.orders[0].arrivalDate, quoted.quote.arrivalDate);
  assert.notEqual(
    completed.orders[0].offerSnapshot,
    quoted.quote.offerSnapshot,
  );
  assert.equal(
    mock.approve(mock.restoreState(JSON.stringify(quoted)), now + 1000).orders
      .length,
    1,
  );
  const previousConcern = entry.concern;
  try {
    entry.concern = "Updated display copy only";
    assert.equal(mock.approve(quoted, now + 1000).orders.length, 1);
  } finally {
    entry.concern = previousConcern;
  }
});

test("legacy local sessions retain history and require rechecking unsnapshotted quotes", () => {
  const quoted = mock.reserve(ready(), "b-p3", now);
  const legacy = JSON.parse(JSON.stringify(quoted));
  delete legacy.journey;
  delete legacy.quote.offerSnapshot;
  delete legacy.quote.arrivalDate;
  const restored = mock.restoreState(JSON.stringify(legacy));
  assert.equal(restored.page, "results");
  assert.equal(restored.quote, null);
  assert.equal(restored.journey, "results");
});

test("no-match explains the actual price or delivery bottleneck", () => {
  assert.match(
    mock.noMatchReason({ ...ready(), budget: "500" }, now),
    /\$680.*exceeds/,
  );
  assert.match(
    mock.noMatchReason(
      { ...ready(), budget: "700", deadline: "2026-10-25" },
      now,
    ),
    /after your Oct 25 deadline/,
  );
});

test('bounded demo history remains recoverable after the 101st order', () => {
  const previousOrders = Array.from({ length: 100 }, (_, i) => ({ id: `previous-${i}`, offerId: 'b-p3', totalCents: 97000, createdAt: now - i - 1 }));
  const quoted = mock.reserve({ ...ready(), orders: previousOrders }, 'b-p3', now);
  const completed = mock.approve(quoted, now + 1000);
  const restored = mock.restoreState(JSON.stringify(completed));
  assert.equal(restored.orders.length, 100);
  assert.equal(restored.page, 'receipt');
  assert.equal(restored.orders.at(-1).id, completed.orders.at(-1).id);
});
