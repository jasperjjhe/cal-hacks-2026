import { createAccount } from "@convex-dev/auth/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
// Internal-only provisioning. No public role or signup endpoint exists.
export const provisionOperator = internalAction({
  args: { merchantId: v.string(), email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<{ userId: string }> => {
    if (
      !/^merchant_[abc]$/.test(args.merchantId) ||
      !/^\S+@\S+\.\S+$/.test(args.email) ||
      args.password.length < 12 ||
      args.password.length > 256
    )
      throw new Error("Invalid operator provisioning fields.");
    const email = args.email.toLowerCase();
    const existing = await ctx.runQuery(internal.buyerAdmin.findAccount, {
      email,
    });
    const userId =
      existing ??
      String(
        (
          await createAccount(ctx, {
            provider: "password",
            account: { id: email, secret: args.password },
            profile: { email },
          })
        ).user._id,
      );
    await ctx.runMutation(internal.buyerAdmin.assignMembership, {
      userId,
      merchantId: args.merchantId,
    });
    return { userId };
  },
});
export const findAccount = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    return account ? String(account.userId) : null;
  },
});
export const assignMembership = internalMutation({
  args: { userId: v.string(), merchantId: v.string() },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.userId))
      .collect();
    if (membership.some((m) => m.merchantId !== args.merchantId && m.enabled))
      throw new Error("Operator already belongs to another merchant.");
    const existing = membership.find((m) => m.merchantId === args.merchantId);
    if (existing) await ctx.db.patch(existing._id, { enabled: true });
    else
      await ctx.db.insert("memberships", {
        authSubject: args.userId,
        merchantId: args.merchantId,
        role: "operator",
        enabled: true,
        createdAt: Date.now(),
      });
  },
});
export const configureDemo = internalMutation({
  args: {
    agents: v.optional(v.union(v.literal("fixture"), v.literal("live"))),
    paymentScenario: v.optional(
      v.union(
        v.literal("success"),
        v.literal("declined"),
        v.literal("unknown_then_success"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined) continue;
      const prior = await ctx.db
        .query("buyerSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (prior) await ctx.db.patch(prior._id, { value });
      else await ctx.db.insert("buyerSettings", { key, value });
    }
    return null;
  },
});
