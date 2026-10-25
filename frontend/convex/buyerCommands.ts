import { actionGeneric, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { safeError } from "./buyer/core.ts";
// Keep expected domain errors structured while preserving rollback: every write
// runs in an internal Convex transaction. Catching inside that transaction would
// otherwise commit writes made before a failed stock/approval guard.
export function command(name: string) {
  return actionGeneric({
    args: { input: v.any() },
    handler: async (ctx, { input }): Promise<unknown> => {
      try {
        return {
          ok: true,
          value: await ctx.runMutation(
            makeFunctionReference<"mutation">(`buyerMutations:${name}`),
            { input },
          ),
        };
      } catch (error) {
        return { ok: false, error: safeError(error) };
      }
    },
  });
}
