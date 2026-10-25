import { contracts } from "../../src/contracts/index.ts";
import type { Contract } from "../../src/contracts/index.ts";
import type {
  CatalogSnapshot,
  OfferVersion as SellerOffer,
} from "../lib/sellerContracts.ts";
import { arrivalAt } from "./core.ts";
export function projectOffer(input: {
  raw: SellerOffer;
  offer: Contract<"Ref">;
  request: Contract<"RequestVersion">;
  runId: string;
  products: CatalogSnapshot[];
  initialTotal: number;
  argument: string;
}) {
  const { raw, request } = input;
  const checks = raw.fit.requirements.map((r) => {
    const req = request.brief.lines
      .flatMap((l) => l.requirements)
      .find((q) => q.id === r.requirementId)!;
    const line = request.brief.lines.find((l) =>
      l.requirements.some((q) => q.id === r.requirementId),
    );
    const offerLine = raw.lines.find((l) => l.requestLineId === line?.lineId);
    const snapshot = input.products.find(
      (p) => p.listing.listing.id === offerLine?.listing.id,
    );
    const attr =
      snapshot?.listing.diagnosticAttributes[req.fieldId] ??
      snapshot?.variant.attributes[req.fieldId];
    return {
      requirementId: r.requirementId,
      status: r.status === "satisfied" ? ("matched" as const) : r.status,
      actual: attr?.value ?? null,
      sourceIds: attr?.sourceId ? [attr.sourceId] : [],
      explanation:
        r.status === "satisfied"
          ? "The validated attribute meets this requirement."
          : r.status === "unknown"
            ? "This required fact is unavailable."
            : "This requirement is not met.",
    };
  });
  const fit = contracts.FitAssessment.parse({
    checks,
    coveragePercent: raw.fit.coverage,
    hardRequirementsPass: raw.fit.hardRequirementsPassed,
    scoringVersion: 1,
  });
  const arrival = arrivalAt(raw.createdAt, raw.arrivalCalendarDays);
  const affordable = raw.totalCents <= request.privateMaximumCents;
  const eligible =
    fit.hardRequirementsPass && arrival <= request.brief.deliveryDeadline;
  const data = contracts.OfferVersion.parse({
    offer: input.offer,
    candidateId: raw.candidateId,
    request: request.request,
    runId: input.runId,
    merchantId: raw.merchantId,
    policy: raw.policy,
    lines: raw.lines,
    claims: raw.claims,
    fitArgument: input.argument,
    fit,
    itemsCents: raw.itemsCents,
    shippingCents: raw.shippingCents,
    taxCents: 0,
    totalCents: raw.totalCents,
    arrivalAt: arrival,
    warrantyMonths: raw.warrantyMonths,
    returnDays: raw.returnDays,
    acceptedAt: raw.createdAt,
    expiresAt: raw.createdAt + 900000,
    policyValid: true,
    requirementsValidExceptBudget: eligible,
    affordable,
    selectable: eligible && affordable,
  });
  const products = [...raw.lines].sort((a, b) => {
    const primary = request.brief.lines.find(l => l.role === "primary")!.lineId;
    return Number(b.requestLineId === primary) - Number(a.requestLineId === primary);
  }).map((line) => {
    const snapshot = input.products.find(
      (s) => s.listing.listing.id === line.listing.id,
    )!;
    return {
      requestLineId: line.requestLineId,
      variantId: snapshot.variant.id,
      title: snapshot.variant.title,
      condition: snapshot.listing.condition,
      quantity: line.quantity,
    };
  });
  const card = contracts.OfferCard.parse({
    offer: input.offer,
    merchant: {
      id: raw.merchantId,
      displayName: `Demo Merchant ${raw.merchantId.slice(-1).toUpperCase()}`,
      demo: true,
    },
    products,
    totalCents: raw.totalCents,
    initialTotalCents: input.initialTotal,
    currency: "USD",
    arrivalAt: arrival,
    warrantyMonths: raw.warrantyMonths,
    returnDays: raw.returnDays,
    fit,
    fitArgument: input.argument,
    mainConcern:
      "Owner evidence is unavailable until applicable sources are retrieved.",
    evidenceStatus: "pending",
    evidenceIds: [],
    expiresAt: data.expiresAt,
    selectable: false,
    unavailableReason: eligible
      ? affordable
        ? "Checks are still in progress."
        : "Above your private delivered-price ceiling."
      : "A hard requirement or deadline is not met.",
  });
  return { data, card };
}
