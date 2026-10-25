import type { Contract } from "../../src/contracts/index.ts";
export type PaymentClaim = {
  executionId: string;
  quote: Contract<"FirmQuote">;
  scenario: string;
  providerReference: string | null;
};
export type PaymentOutcome = {
  status: "succeeded" | "declined" | "pending" | "unknown";
  providerReference: string | null;
};
// FINAL INTEGRATION POINT: replace only this function for a verified Visa test.
// Keep quote hash, mode/operation, idempotent executionId and lookup semantics.
export async function executePayment(
  claim: PaymentClaim,
): Promise<PaymentOutcome> {
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
// Only the pinned RAG Actor may discover sources under the server-owned domain policy.
export { startEvidence, pollEvidence } from "./apifyBuyer.ts";
