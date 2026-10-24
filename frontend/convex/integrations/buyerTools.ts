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
// FINAL INTEGRATION POINTS: inputs are immutable and scoped by the server. These
// intentionally contain no guessed CREAO endpoints or browser credentials.
export async function invokeCreao(_job: ToolJob): Promise<ToolResult> {
  void _job;
  return { status: "failed", providerRunId: null };
}
export async function pollCreao(_job: ToolJob): Promise<ToolResult> {
  void _job;
  return { status: "failed", providerRunId: null };
}
export async function cancelCreao(_job: ToolJob): Promise<void> {
  void _job; /* Fill best-effort vendor cancellation. Stale completion guards remain authoritative. */
}
export interface EvidenceInput {
  variantId: string;
  syntheticProduct: boolean;
  sourceIds: string[];
  inputDigest: string;
  urls: string[];
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
// FINAL INTEGRATION POINTS: start/poll only a pinned, allowlisted Apify Actor.
// Never take dataset IDs from an unverified webhook body or arbitrary buyer URL.
export async function startEvidence(
  _input: EvidenceInput,
): Promise<EvidenceResult> {
  void _input;
  return { status: "unavailable" };
}
export async function pollEvidence(
  _input: EvidenceInput,
  _providerRunId: string,
): Promise<EvidenceResult> {
  void _providerRunId;
  void _input;
  return { status: "unavailable" };
}
