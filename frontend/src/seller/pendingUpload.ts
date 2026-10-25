// Keeps the pending bulk upload in localStorage so it survives a reload until it's imported or cleared.
// (It used to live in cookies, which were sent with every request and could exceed the server's header limit.)
import type { BulkRecord } from "./inventory.ts";

const storageKey = "converge.seller.pendingUpload.v1";
const legacyCookiePrefix = "bu_seller_upload_";

export type PendingUpload = { fileName: string; records: BulkRecord[] };

function isRecord(value: unknown): value is BulkRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.name === "string" && typeof r.sku === "string" && typeof r.category === "string" &&
    typeof r.description === "string" && typeof r.line === "number" &&
    [r.minPrice, r.maxPrice, r.stock].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
}

export function decodeUpload(text: string): PendingUpload | null {
  try {
    const parsed = JSON.parse(text) as Partial<PendingUpload>;
    if (typeof parsed.fileName !== "string" || !Array.isArray(parsed.records) || !parsed.records.every(isRecord)) return null;
    return { fileName: parsed.fileName, records: parsed.records };
  } catch {
    return null;
  }
}

function clearLegacyCookies() {
  for (const pair of document.cookie.split("; ")) {
    const name = pair.slice(0, pair.indexOf("="));
    if (name.startsWith(legacyCookiePrefix)) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict`;
  }
}

export function clearPendingUpload() {
  clearLegacyCookies();
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Storage unavailable: nothing was persisted.
  }
}

export function loadPendingUpload(): PendingUpload | null {
  clearLegacyCookies();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? decodeUpload(raw) : null;
  } catch {
    return null;
  }
}

// Returns false when the upload couldn't be stored (quota or privacy mode); it then lives only in memory.
export function savePendingUpload(upload: PendingUpload): boolean {
  if (upload.records.length === 0) {
    clearPendingUpload();
    return true;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(upload));
    return true;
  } catch {
    clearPendingUpload();
    return false;
  }
}
