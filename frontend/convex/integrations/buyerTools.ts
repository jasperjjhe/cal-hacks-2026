import type { Contract } from "../../src/contracts/index.ts";
export type PaymentClaim = {
  executionId: string;
  createdAt?: number;
  quote: Contract<"FirmQuote">;
  scenario: string;
  providerReference: string | null;
};
export type PaymentOutcome = {
  checkoutUrl?: string | null;
  status: "succeeded" | "declined" | "pending" | "unknown";
  providerReference: string | null;
};
// Simulation remains available without provider credentials.
export async function executePayment(
  claim: PaymentClaim,
): Promise<PaymentOutcome> {
  if (claim.quote.paymentMode === "stripe_test") return stripePayment(claim);
  if (claim.quote.paymentMode !== "simulation")
    throw new Error(
      "Fill the supported payment adapter before enabling sandbox mode.",
    );
  return {
    status:
      claim.scenario === "declined"
        ? "declined"
        : claim.scenario === "unknown_then_success"
          ? "unknown"
          : "succeeded",
    providerReference: `simulation:${claim.executionId}`,
  };
}
export async function reconcilePayment(
  claim: PaymentClaim,
): Promise<PaymentOutcome> {
  if (claim.quote.paymentMode === "stripe_test") return stripePayment(claim);
  if (claim.quote.paymentMode !== "simulation")
    throw new Error("Fill the supported status-lookup adapter.");
  return {
    status:
      claim.scenario === "unknown_then_success"
        ? "succeeded"
        : claim.scenario === "declined"
          ? "declined"
          : "succeeded",
    providerReference:
      claim.providerReference ?? `simulation:${claim.executionId}`,
  };
}
// shortcut: scheduled status lookup avoids webhook setup for the MVP; add webhooks before production.
export async function stripePayment(claim: PaymentClaim): Promise<PaymentOutcome> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Stripe test secret is required.");
  const reference = claim.providerReference;
  if (reference && !/^cs_test_[A-Za-z0-9_]+$/.test(reference)) throw new Error("Invalid Stripe session.");
  let body: URLSearchParams | undefined;
  if (!reference) {
    // Never reuse an expired idempotency key to start another checkout.
    if (!claim.createdAt || Date.now() - claim.createdAt > 10 * 60000) throw new Error("Checkout creation needs reconciliation.");
    const origin = new URL(process.env.SITE_URL || "http://localhost:5173");
    if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("Invalid checkout return origin.");
    const returnUrl = new URL("/", origin.origin);
    returnUrl.searchParams.set("request", claim.quote.request.id);
    body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(claim.quote.totalCents),
      "line_items[0][price_data][product_data][name]": "Converge demo bundle (test purchase)",
      "line_items[0][quantity]": "1",
      client_reference_id: claim.executionId,
      success_url: returnUrl.href,
      cancel_url: returnUrl.href,
      expires_at: String(Math.floor(claim.createdAt / 1000) + 40 * 60),
    });
  }
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions${reference ? `/${reference}` : ""}`, {
    method: reference ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": claim.executionId } : {}),
    },
    ...(body ? { body } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.json().then(body => body?.error?.message, () => undefined);
    throw new Error(`Stripe HTTP ${response.status}${typeof detail === "string" ? `: ${detail.slice(0, 300)}` : "."}`);
  }
  const session = await response.json();
  if (
    typeof session.id !== "string" || !session.id.startsWith("cs_test_") ||
    (reference && session.id !== reference) || session.livemode !== false ||
    session.client_reference_id !== claim.executionId || session.currency !== "usd" ||
    session.amount_total !== claim.quote.totalCents
  ) throw new Error("Stripe session does not match approved terms.");
  if (session.status === "complete" && session.payment_status === "paid")
    return { status: "succeeded", providerReference: session.id };
  if (session.status === "expired" && session.payment_status === "unpaid")
    return { status: "declined", providerReference: session.id };
  if (session.status === "open" && session.payment_status === "unpaid" && typeof session.url === "string") {
    const url = new URL(session.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Invalid Stripe checkout URL.");
    return { status: "pending", providerReference: session.id, checkoutUrl: url.href };
  }
  return { status: "unknown", providerReference: session.id };
}
export interface ToolJob {
  id: string;
  role: string;
  input: unknown;
  providerRunId: string | null;
  deadlineAt: number;
  config?: { appId: string; model: string | null; revision: string } | null;
}
export type ToolResult =
  | { status: "pending"; providerRunId: string }
  | {
      status: "completed";
      providerRunId: string;
      output: unknown;
      model: string | null;
    }
  | { status: "failed"; providerRunId: string | null };
// Buyer roles use the documented API; credentials stay in backend environment variables.
export { invokeCreao, pollCreao, cancelCreao } from "./creaoBuyer.ts";
export interface EvidenceInput {
  provider?: "web" | "reddit";
  community?: string;
  variantId: string;
  syntheticProduct: boolean;
  inputDigest: string;
  productName: string;
  query: string;
  domains: string[];
  actorId: string;
  build: string;
  buildNumber: string;
}
export type EvidenceResult =
  | { status: "pending"; providerRunId: string; build: string }
  | {
      status: "completed";
      providerRunId: string;
      build: string;
      evidence: Contract<"Evidence">[];
      facts?: {
        evidenceId: string;
        fieldId: string;
        value: string | number | boolean | string[] | null;
        unit: string | null;
      }[];
    }
  | { status: "unavailable" };
// Pinned web and Reddit Actors share the server-owned evidence policy.
import { startEvidence as startWebEvidence, pollEvidence as pollWebEvidence } from "./apifyBuyer.ts";
import { startRedditEvidence, pollRedditEvidence } from "./redditBuyer.ts";
export function startEvidence(input: EvidenceInput): Promise<EvidenceResult> {
  return input.provider === "reddit" ? startRedditEvidence(input) : startWebEvidence(input);
}
export function pollEvidence(input: EvidenceInput, runId: string): Promise<EvidenceResult> {
  return input.provider === "reddit" ? pollRedditEvidence(input, runId) : pollWebEvidence(input, runId);
}
