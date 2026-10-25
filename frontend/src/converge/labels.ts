import type { Contract, OfferCard } from "../contracts";
import { label as pretty } from "./format";

type Profile = Contract<"CategoryProfile">;
type Confirmed = Contract<"RequestVersion">;

/** requirementId → the human label of the field the buyer asked about. */
export function requirementLabels(
  confirmed: Confirmed | null | undefined,
  profiles: Profile[] | undefined,
) {
  const labels = new Map<string, string>();
  if (!confirmed) return labels;
  for (const line of confirmed.brief.lines) {
    const profile = profiles?.find(
      (p) =>
        p.profile.id === line.profile.id &&
        p.profile.version === line.profile.version,
    );
    for (const r of line.requirements)
      labels.set(
        r.id,
        profile?.fields.find((f) => f.id === r.fieldId)?.label ??
          pretty(r.fieldId),
      );
  }
  return labels;
}

export type Point = { key: string; title: string; text: string };

/**
 * Pros and cons come only from the server's requirement checks for this offer
 * (plus its stated main concern). Unknown facts are listed as cons and
 * labelled, never silently treated as a match.
 */
export function prosAndCons(card: OfferCard, labels: Map<string, string>) {
  const pros: Point[] = [];
  const cons: Point[] = [];
  for (const check of card.fit.checks) {
    const point = {
      key: check.requirementId,
      title: labels.get(check.requirementId) ?? "Requirement",
      text: check.explanation,
    };
    if (check.status === "matched") pros.push(point);
    else
      cons.push({
        ...point,
        title:
          check.status === "unknown" ? `${point.title} (not confirmed)` : point.title,
      });
  }
  if (card.mainConcern && !cons.some((c) => c.text === card.mainConcern))
    cons.push({ key: "main-concern", title: "Main concern", text: card.mainConcern });
  return { pros, cons };
}

const evidenceWords: Record<OfferCard["evidenceStatus"], string> = {
  pending: "still checking",
  complete: "checked",
  partial: "partly checked",
  unavailable: "none available",
  cached: "cached, up to 24 h old",
};

export const evidenceLine = (card: OfferCard) =>
  card.evidenceIds.length
    ? `${card.evidenceIds.length} evidence excerpt${card.evidenceIds.length === 1 ? "" : "s"} · ${evidenceWords[card.evidenceStatus]}`
    : "No independent evidence available yet";

export const fitLine = (card: OfferCard) =>
  card.fit.coveragePercent === null
    ? "No scored preferences"
    : `${Math.round(card.fit.coveragePercent)}% preference fit`;

/** Empty-state copy for the Pros column; "nothing asked" differs from "nothing matched". */
export const noProsCopy = (card: OfferCard) =>
  card.fit.checks.length === 0
    ? "You haven’t set specific requirements, so there’s nothing to check yet. Refine your search to add some."
    : "None of your requirements were confirmed for this offer.";

export const matches = (card: OfferCard, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    card.merchant.displayName,
    card.fitArgument,
    card.mainConcern ?? "",
    ...card.products.map((p) => p.title),
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
};

/** A check's `actual` value as a person would say it ("Yes", not "true"). */
export const actualText = (actual: unknown) =>
  actual === null || actual === undefined
    ? "Not confirmed"
    : typeof actual === "boolean"
      ? actual
        ? "Yes"
        : "No"
      : Array.isArray(actual)
        ? actual.join(", ")
        : String(actual);
