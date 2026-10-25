import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBulkInventory, sampleBulkFile } from "../src/seller/inventory.ts";
import { clearPendingUpload, decodeUpload, loadPendingUpload, savePendingUpload } from "../src/seller/pendingUpload.ts";

function stubBrowser({ quota = Infinity } = {}) {
  const items = new Map<string, string>();
  const cookies = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > quota) throw new DOMException("full", "QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key: string) => items.delete(key),
  });
  vi.stubGlobal("document", {
    get cookie() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(value: string) {
      const [pair] = value.split("; ");
      const at = pair.indexOf("=");
      if (/Max-Age=0/.test(value)) cookies.delete(pair.slice(0, at));
      else cookies.set(pair.slice(0, at), pair.slice(at + 1));
    },
  });
  return { items, cookies };
}

describe("pending bulk upload storage", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips a pending upload through localStorage, never cookies", () => {
    const { cookies } = stubBrowser();
    const { records } = parseBulkInventory(sampleBulkFile.name, sampleBulkFile.text);
    records[0].description = "Ünïcödé — “quotes”; semicolons, = signs & emoji 🚀";
    const upload = { fileName: "vendor inventory.jsonl", records };
    expect(savePendingUpload(upload)).toBe(true);
    expect(cookies.size).toBe(0);
    expect(loadPendingUpload()).toEqual(upload);
    clearPendingUpload();
    expect(loadPendingUpload()).toBeNull();
  });

  it("removes legacy upload cookies so they stop riding on requests", () => {
    const { cookies } = stubBrowser();
    cookies.set("bu_seller_upload_0", "x".repeat(3800));
    cookies.set("bu_seller_upload_n", "1");
    cookies.set("other", "keep");
    loadPendingUpload();
    expect([...cookies.keys()]).toEqual(["other"]);
  });

  it("reports failure when storage is full", () => {
    stubBrowser({ quota: 10 });
    const { records } = parseBulkInventory(sampleBulkFile.name, sampleBulkFile.text);
    expect(savePendingUpload({ fileName: "big.jsonl", records })).toBe(false);
    expect(loadPendingUpload()).toBeNull();
  });

  it("rejects tampered or malformed stored data", () => {
    expect(decodeUpload(JSON.stringify({ fileName: "x", records: [{ name: "a" }] }))).toBeNull();
    expect(decodeUpload(JSON.stringify({ fileName: "x", records: [{ line: 1, name: "a", sku: "A", category: "", description: "", minPrice: -1, maxPrice: 1, stock: 1 }] }))).toBeNull();
    expect(decodeUpload("{not json")).toBeNull();
  });
});
