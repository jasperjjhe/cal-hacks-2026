// Keeps the pending bulk upload in cookies so it survives a reload until it's imported or cleared.
// Browsers cap a cookie near 4 KB, so the JSON is split across numbered cookies.
import type { BulkRecord } from "./inventory.ts";

const prefix = "bu_seller_upload_";
const chunkSize = 3800;
export const maxChunks = 10;
const maxAgeSeconds = 7 * 24 * 60 * 60;

export type PendingUpload = { fileName: string; records: BulkRecord[] };

export function encodeChunks(text: string, size = chunkSize): string[] {
  const encoded = encodeURIComponent(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < encoded.length) {
    let end = Math.min(start + size, encoded.length);
    // Don't split a %XX escape across chunks.
    const pct = encoded.lastIndexOf("%", end - 1);
    if (end < encoded.length && pct > end - 3 && pct > start) end = pct;
    chunks.push(encoded.slice(start, end));
    start = end;
  }
  return chunks;
}

function isRecord(value: unknown): value is BulkRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.name === "string" && typeof r.sku === "string" && typeof r.category === "string" &&
    typeof r.description === "string" && typeof r.line === "number" &&
    [r.minPrice, r.maxPrice, r.stock].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
}

export function decodeUpload(chunks: string[]): PendingUpload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(chunks.join(""))) as Partial<PendingUpload>;
    if (typeof parsed.fileName !== "string" || !Array.isArray(parsed.records) || !parsed.records.every(isRecord)) return null;
    return { fileName: parsed.fileName, records: parsed.records };
  } catch {
    return null;
  }
}

function readCookies(): Map<string, string> {
  return new Map(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return [pair.slice(0, at), pair.slice(at + 1)] as [string, string];
      }),
  );
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
}

export function clearUploadCookie() {
  for (const name of readCookies().keys()) {
    if (name.startsWith(prefix)) setCookie(name, "", 0);
  }
}

export function loadUploadCookie(): PendingUpload | null {
  const cookies = readCookies();
  const count = Number(cookies.get(`${prefix}n`));
  if (!Number.isInteger(count) || count < 1 || count > maxChunks) return null;
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = cookies.get(`${prefix}${i}`);
    if (chunk === undefined) return null;
    chunks.push(chunk);
  }
  return decodeUpload(chunks);
}

// Returns false when the upload is too large to fit; it then lives only in memory.
export function saveUploadCookie(upload: PendingUpload): boolean {
  clearUploadCookie();
  if (upload.records.length === 0) return true;
  const chunks = encodeChunks(JSON.stringify(upload));
  if (chunks.length > maxChunks) return false;
  chunks.forEach((chunk, i) => setCookie(`${prefix}${i}`, chunk, maxAgeSeconds));
  setCookie(`${prefix}n`, String(chunks.length), maxAgeSeconds);
  return true;
}
