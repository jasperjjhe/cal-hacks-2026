import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import type { SellerQueryCtx, SellerMutationCtx } from "../sellerAuth.ts";
import { contracts } from "../../src/contracts/index.ts";
import type { Contract, ApiError } from "../../src/contracts/index.ts";
export type ReadCtx = SellerQueryCtx | SellerMutationCtx;
export type WriteCtx = SellerMutationCtx;
export const terminalStages = ["results", "no_match", "failed", "cancelled"];
export const idSchema = contracts.Ref.shape.id;
export const keySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const refValidator = { id: idSchema, version: z.int().min(1) };
export function fail(
  code: ApiError["code"],
  message: string,
  retryable = false,
): never {
  throw new ConvexError({
    code,
    message,
    retryable,
    correlationId: crypto.randomUUID(),
  });
}
export async function owner(ctx: ReadCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) fail("FORBIDDEN", "Sign in to your buyer session.");
  return String(id);
}
export async function requestFor(ctx: ReadCtx, id: string) {
  const user = await owner(ctx);
  const dbId = ctx.db.normalizeId("buyerRequests", id);
  const row = dbId ? await ctx.db.get(dbId) : null;
  if (!row || row.ownerId !== user)
    fail("FORBIDDEN", "Request is unavailable.");
  return row;
}
export async function runFor(ctx: ReadCtx, id: string) {
  const dbId = ctx.db.normalizeId("buyerRuns", id);
  return dbId ? ctx.db.get(dbId) : null;
}
export async function versionFor(
  ctx: ReadCtx,
  requestId: string,
  version: number,
) {
  const row = await ctx.db
    .query("buyerRequestVersions")
    .withIndex("by_request_version", (q) =>
      q.eq("requestId", requestId).eq("version", version),
    )
    .unique();
  if (!row) fail("STALE_VERSION", "Confirmed request version is unavailable.");
  return contracts.RequestVersion.parse(row.data);
}
export async function currentRun(
  ctx: ReadCtx,
  id: string,
  expectedPhase?: string,
) {
  const run = await runFor(ctx, id);
  if (!run) return null;
  const requestId = ctx.db.normalizeId("buyerRequests", run.requestId);
  const req = requestId ? await ctx.db.get(requestId) : null;
  if (
    !req ||
    req.activeRunId !== id ||
    req.version !== run.version ||
    run.stage === "cancelled" ||
    run.stage === "failed" ||
    (expectedPhase && run.stage !== expectedPhase)
  )
    return null;
  return run;
}
export async function emit(
  ctx: WriteCtx,
  runId: string,
  kind: Contract<"RunEvent">["kind"],
  summary: string,
  merchantId: string | null = null,
  offer: Contract<"Ref"> | null = null,
) {
  const run = await runFor(ctx, runId);
  if (!run) return;
  const sequence = run.sequence + 1;
  const id = await ctx.db.insert("buyerEvents", {
    runId,
    sequence,
    data: null,
  });
  await ctx.db.patch(id, {
    data: contracts.RunEvent.parse({
      id: String(id),
      request: { id: run.requestId, version: run.version },
      runId,
      sequence,
      createdAt: Date.now(),
      kind,
      merchantId,
      offer,
      summary,
    }),
  });
  await ctx.db.patch(run._id, { sequence, updatedAt: Date.now() });
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function replay(
  ctx: WriteCtx,
  operation: string,
  clientKey: string,
  payload: unknown,
) {
  keySchema.parse(clientKey);
  const user = await owner(ctx);
  const hash = await digest(payload);
  const prior = await ctx.db
    .query("buyerCommands")
    .withIndex("by_key", (q) =>
      q
        .eq("ownerId", user)
        .eq("operation", operation)
        .eq("clientKey", clientKey),
    )
    .unique();
  if (prior && prior.digest !== hash)
    fail(
      "INVALID_INPUT",
      "This command key was already used with different terms.",
    );
  return { prior, user, hash };
}
export async function saveCommand<T>(
  ctx: WriteCtx,
  operation: string,
  key: string,
  hash: string,
  user: string,
  result: T,
) {
  await ctx.db.insert("buyerCommands", {
    ownerId: user,
    operation,
    clientKey: key,
    digest: hash,
    result,
    createdAt: Date.now(),
  });
  return result;
}
export function dateOnly(ms: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
export function arrivalAt(now: number, days: number) {
  const day = new Date(`${dateOnly(now)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  const target = day.toISOString().slice(0, 10);
  // Convert end of the local civil date to UTC, including DST offset.
  let utc = Date.parse(`${target}T23:59:59Z`);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "longOffset",
    }).formatToParts(utc);
    const offset = parts
      .find((p) => p.type === "timeZoneName")!
      .value.match(/GMT([+-])(\d{2}):(\d{2})/)!;
    const minutes =
      (Number(offset[2]) * 60 + Number(offset[3])) *
      (offset[1] === "+" ? 1 : -1);
    utc = Date.parse(`${target}T23:59:59Z`) - minutes * 60000;
  }
  return utc;
}
export function safeError(error: unknown): ApiError {
  if (
    error instanceof ConvexError &&
    error.data &&
    typeof error.data === "object"
  ) {
    const parsed = contracts.ApiError.safeParse(error.data);
    if (parsed.success) return parsed.data;
  }
  return {
    code:
      error instanceof z.ZodError ? "INVALID_INPUT" : "PROVIDER_UNAVAILABLE",
    message:
      error instanceof z.ZodError
        ? "Invalid request fields."
        : "The operation could not complete. Try again.",
    retryable: !(error instanceof z.ZodError),
    correlationId: crypto.randomUUID(),
  };
}
export async function enforceUnlocked(ctx: ReadCtx, requestId: string) {
  const attempts = await ctx.db
    .query("buyerExecutions")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .take(30);
  if (attempts.some((a) => a.state === "succeeded"))
    fail(
      "INVALID_INPUT",
      "This request already has a completed order. Start a new request.",
    );
  if (attempts.some((a) => ["pending", "unknown"].includes(a.state)))
    fail(
      "EXECUTION_UNKNOWN",
      "A purchase is still being resolved. Wait for the same attempt.",
    );
}
export async function setting(ctx: ReadCtx, key: string, fallback: unknown) {
  return (
    (
      await ctx.db
        .query("buyerSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )?.value ?? fallback
  );
}
