import { describe, expect, it } from "vitest";
import { parseBulkInventory, sampleBulkFile } from "../src/seller/inventory.ts";
import { decodeUpload, encodeChunks } from "../src/seller/uploadCookie.ts";

describe("bulk upload cookie encoding", () => {
  it("round-trips a pending upload through small chunks without splitting escapes", () => {
    const { records } = parseBulkInventory(sampleBulkFile.name, sampleBulkFile.text);
    records[0].description = "Ünïcödé — “quotes”; semicolons, = signs & emoji 🚀";
    const upload = { fileName: "vendor inventory.jsonl", records };
    const chunks = encodeChunks(JSON.stringify(upload), 50);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
      expect(chunk).not.toMatch(/[;,\s]/);
      expect(chunk).not.toMatch(/%.?$/);
    }
    expect(decodeUpload(chunks)).toEqual(upload);
  });

  it("rejects tampered or malformed cookie data", () => {
    expect(decodeUpload(encodeChunks(JSON.stringify({ fileName: "x", records: [{ name: "a" }] })))).toBeNull();
    expect(decodeUpload(encodeChunks(JSON.stringify({ fileName: "x", records: [{ line: 1, name: "a", sku: "A", category: "", description: "", minPrice: -1, maxPrice: 1, stock: 1 }] })))).toBeNull();
    expect(decodeUpload(["%E0%A4%A"])).toBeNull();
  });
});
