import type { ApiResult } from "../contracts";

const usd = (fractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
const whole = usd(0);
const cents = usd(2);

/** Exact money, always with cents (order summaries, receipts). */
export const money = (c: number) => cents.format(c / 100);
/** Headline price: drops ".00" on whole-dollar amounts, matching the design. */
export const price = (c: number) =>
  c % 100 === 0 ? whole.format(c / 100) : cents.format(c / 100);

const zone = "America/Los_Angeles";
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const fullDay = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  month: "short",
  day: "numeric",
  year: "numeric",
});
export const dayLabel = (ms: number) => dayFormat.format(ms);
export const fullDayLabel = (ms: number) => fullDay.format(ms);

export const dateInput = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);

/** 23:59:59 in San Francisco on the given yyyy-mm-dd day. */
export function endOfDay(day: string) {
  const noon = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(noon)) throw new Error("Choose a delivery date.");
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  })
    .formatToParts(noon)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return Date.parse(`${day}T23:59:59${offset}`);
}

export function unwrap<T>(value: unknown): T {
  const result = value as ApiResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export const clientKey = () => crypto.randomUUID();

export function greeting(ms: number) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(ms),
  );
  return hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";
}

export const label = (value: string) => value.replaceAll("_", " ");

export function clock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
