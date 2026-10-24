import type { ReadCtx } from "./core";

// An accepted offer is a snapshot, not permission for a paused merchant to
// participate in a later phase or dispatch new provider work.
export async function merchantEligible(
  ctx: ReadCtx,
  merchantId: string,
  policy: { id: string; version: number },
) {
  const merchant = await ctx.db
    .query("merchants")
    .withIndex("by_merchantId", q => q.eq("merchantId", merchantId))
    .unique();
  return !!merchant && merchant.enabled && !merchant.paused &&
    merchant.currentPolicyId === policy.id &&
    merchant.currentPolicyVersion === policy.version;
}
