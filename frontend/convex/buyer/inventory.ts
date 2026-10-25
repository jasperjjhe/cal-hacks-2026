import {
  reserveInTransaction,
  transitionAllocationInTransaction,
} from "../lib/sellerInventory.ts";
import type {
  InventoryState,
  ReserveInput,
  AllocationTransition,
} from "../lib/sellerInventory.ts";
import type { WriteCtx } from "./core.ts";
import { fail } from "./core.ts";
export async function loadInventory(
  ctx: WriteCtx,
  listingIds: string[],
): Promise<InventoryState> {
  const capacities: Record<string, number> = {};
  const allocations: InventoryState["allocations"] = [];
  for (const listingId of [...new Set(listingIds)]) {
    const rows = await ctx.db
      .query("listingVersions")
      .withIndex("by_listingId_and_version", (q) =>
        q.eq("listingId", listingId),
      )
      .order("desc")
      .take(2);
    if (!rows[0]?.enabled)
      fail("STOCK_UNAVAILABLE", "Selected stock is unavailable.");
    capacities[listingId] = rows[0].initialQuantity;
    for (const state of ["reserved", "execution_locked", "sold"] as const) {
      const found = await ctx.db
        .query("allocations")
        .withIndex("by_listingId_and_state", (q) =>
          q.eq("listingId", listingId).eq("state", state),
        )
        .filter((q) =>
          state === "reserved"
            ? q.gt(q.field("expiresAt"), Date.now())
            : q.eq(q.field("state"), state),
        )
        .take(501);
      if (found.length > 500)
        fail(
          "LIMIT_REACHED",
          "Inventory ledger requires maintenance before reserving.",
        );
      allocations.push(...found.map(pickAllocation));
    }
  }
  return { initialQuantityByListing: capacities, allocations };
}
export async function reserveStock(ctx: WriteCtx, input: ReserveInput) {
  const inventory = await loadInventory(
    ctx,
    input.lines.map((l) => l.listing.id),
  );
  let result;
  try {
    result = reserveInTransaction(inventory, input);
  } catch {
    fail("STOCK_UNAVAILABLE", "One or more selected units are unavailable.");
  }
  for (const allocation of result.allocations)
    await ctx.db.insert("allocations", { ...allocation, updatedAt: input.now });
  await ctx.db.insert("reservations", {
    reservationKey: input.reservationKey,
    requestId: input.requestId,
    quoteId: input.quoteId,
    merchantId: input.merchantId,
    status: "reserved",
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  });
}
export async function transitionStock(
  ctx: WriteCtx,
  quoteId: string,
  transition: AllocationTransition,
  now: number,
) {
  const reservations = await ctx.db
    .query("reservations")
    .withIndex("by_quoteId", (q) => q.eq("quoteId", quoteId))
    .take(1);
  if (!reservations[0])
    fail("STOCK_UNAVAILABLE", "Reservation is unavailable.");
  const reservation = reservations[0];
  const rows = await ctx.db
    .query("allocations")
    .withIndex("by_reservationKey", (q) =>
      q.eq("reservationKey", reservation.reservationKey),
    )
    .take(4);
  const target =
    transition === "lock"
      ? "execution_locked"
      : transition === "sell"
        ? "sold"
        : "released";
  if (rows.every((r) => r.state === target)) return;
  let inventory: InventoryState = {
    initialQuantityByListing: {},
    allocations: rows.map(pickAllocation),
  };
  try {
    for (const row of rows)
      inventory = transitionAllocationInTransaction(
        inventory,
        row.allocationId,
        transition,
        now,
      );
  } catch {
    fail("EXPIRED", "The stock hold is no longer valid.");
  }
  for (const row of rows)
    await ctx.db.patch(row._id, {
      state: inventory.allocations.find(
        (a) => a.allocationId === row.allocationId,
      )!.state,
      updatedAt: now,
    });
  await ctx.db.patch(reservation._id, { status: target, updatedAt: now });
}
export async function releaseRequestHolds(ctx: WriteCtx, requestId: string) {
  const rows = await ctx.db
    .query("buyerQuotes")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .take(100);
  for (const quote of rows)
    if (quote.state === "reserved") {
      await transitionStock(ctx, String(quote._id), "release", Date.now());
      await ctx.db.patch(quote._id, { state: "released" });
    }
}

function pickAllocation(
  row: InventoryState["allocations"][number],
): InventoryState["allocations"][number] {
  return {
    allocationId: row.allocationId,
    reservationKey: row.reservationKey,
    requestId: row.requestId,
    quoteId: row.quoteId,
    merchantId: row.merchantId,
    requestLineId: row.requestLineId,
    listingId: row.listingId,
    listingVersion: row.listingVersion,
    quantity: row.quantity,
    unitCents: row.unitCents,
    state: row.state,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
