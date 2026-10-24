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
    const memberships = await ctx.db.query("operatorAccounts").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    if (memberships.some(m => m.merchantId !== args.merchantId && m.enabled)) throw new Error("Operator already belongs to another merchant.");
    const existing = memberships.find(m => m.merchantId === args.merchantId);
    if (existing) await ctx.db.patch(existing._id, { enabled: true });
    else await ctx.db.insert("operatorAccounts", { ...args, enabled: true, createdAt: Date.now() });
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

// Add the documented synthetic unit diagnostics to an already-seeded local
// demo without resetting quantities, payments or the approved order snapshots.
export const upgradeDemoDiagnostics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const seeded = await ctx.db.query("seedRuns").first();
    if (!seeded) throw new Error("Seed the fictional catalog first.");
    const known: Record<string, number> = {
      "merchant_a:P1": 92,
      "merchant_a:P5": 90,
      "merchant_b:P2": 88,
      "merchant_c:P5": 85,
    };
    let updated = 0;
    for (const merchantId of ["merchant_a", "merchant_b", "merchant_c"]) {
      const rows = await ctx.db
        .query("listingVersions")
        .withIndex("by_merchantId_and_enabled", (q) =>
          q.eq("merchantId", merchantId).eq("enabled", true),
        )
        .collect();
      for (const row of rows) {
        if (
          !/^P[1-6]$/.test(row.variantId) ||
          row.diagnosticAttributes.includedCharger
        )
          continue;
        const { _id, _creationTime, ...listing } = row;
        void _creationTime;
        await ctx.db.patch(_id, { enabled: false });
        await ctx.db.insert("listingVersions", {
          ...listing,
          version: row.version + 1,
          diagnosticAttributes: {
            ...row.diagnosticAttributes,
            healthPercent: {
              value:
                row.condition === "refurbished"
                  ? (known[row.listingId] ?? null)
                  : null,
              unit: "%",
              provenance: "synthetic_demo",
              sourceId: null,
            },
            includedCharger: {
              value: true,
              unit: null,
              provenance: "synthetic_demo",
              sourceId: null,
            },
          },
        });
        updated++;
      }
    }
    return { updated };
  },
});

// Deploy the transitional optional legacy field, run this idempotent migration,
// then bind each authenticated operator session. Legacy rows grant no access.
export const migrateOperatorMemberships = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("memberships").collect();
    let migrated = 0;
    for (const row of rows) {
      if (!row.authSubject) continue;
      if (row.authSubject.startsWith("demo:")) {
        await ctx.db.patch(row._id, { authTokenIdentifier: row.authSubject, authSubject: undefined });
      } else {
        const existing = await ctx.db.query("operatorAccounts").withIndex("by_user", q => q.eq("userId", row.authSubject!)).collect();
        if (!existing.some(m => m.merchantId === row.merchantId)) await ctx.db.insert("operatorAccounts", { userId: row.authSubject, merchantId: row.merchantId, enabled: row.enabled, createdAt: row.createdAt });
        await ctx.db.delete(row._id);
      }
      migrated++;
    }
    return { migrated };
  },
});
