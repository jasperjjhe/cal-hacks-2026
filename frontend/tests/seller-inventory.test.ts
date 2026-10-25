import { describe, expect, it } from "vitest";
import {
  applyBulkImport,
  draftFromProduct,
  initialInventory,
  parseBulkInventory,
  parseInventory,
  priceRange,
  sampleBulkFile,
  seedProducts,
  stockLevel,
  validateDraft,
} from "../src/seller/inventory.ts";

describe("seller inventory", () => {
  it("classifies stock like the design", () => {
    expect(stockLevel(0)).toBe("out");
    expect(stockLevel(11)).toBe("low");
    expect(stockLevel(18)).toBe("low");
    expect(stockLevel(27)).toBe("in");
  });

  it("formats single prices and ranges", () => {
    expect(priceRange({ minPrice: 1799, maxPrice: 1799 })).toBe("$1,799");
    expect(priceRange({ minPrice: 1099, maxPrice: 1499 })).toBe("$1,099–$1,499");
  });

  it("parses JSONL, price ranges, and reports bad lines", () => {
    const text = `${sampleBulkFile.text}\n{"title":"No SKU","price":5,"quantity":1}\nnot json`;
    const result = parseBulkInventory("vendor.jsonl", text);
    expect(result.format).toBe("JSONL");
    expect(result.totalRows).toBe(5);
    expect(result.records.map((r) => r.sku)).toEqual(["FW-16-B", "FW-13-A", "TD-MINI"]);
    expect(result.records[1]).toMatchObject({ minPrice: 1099, maxPrice: 1499, stock: 42 });
    expect(result.issues).toEqual([
      { line: 5, message: "Not valid JSON." },
      { line: 4, message: "Missing sku." },
    ]);
  });

  it("parses a JSON array and a {products} wrapper, rejecting duplicate SKUs", () => {
    const rows = [
      { title: "A", sku: "a-1", price: "$10", quantity: "3" },
      { title: "B", sku: "A-1", price: 12, quantity: 1 },
    ];
    const array = parseBulkInventory("x.json", JSON.stringify(rows));
    expect(array.format).toBe("JSON");
    expect(array.records).toHaveLength(1);
    expect(array.records[0]).toMatchObject({ sku: "A-1", minPrice: 10, stock: 3 });
    expect(array.issues[0].message).toContain("Duplicate SKU");
    expect(parseBulkInventory("x.json", JSON.stringify({ products: rows })).records).toHaveLength(1);
  });

  it("rejects negative or fractional quantities and inverted ranges", () => {
    const text = [
      { title: "A", sku: "A", price: 1, quantity: -1 },
      { title: "B", sku: "B", price: 1, quantity: 1.5 },
      { title: "C", sku: "C", price: { min: 9, max: 3 }, quantity: 1 },
    ].map((r) => JSON.stringify(r)).join("\n");
    const result = parseBulkInventory("x.jsonl", text);
    expect(result.records).toHaveLength(0);
    expect(result.issues).toHaveLength(3);
  });

  it("updates existing SKUs in place and adds new ones", () => {
    const products = seedProducts();
    const { records } = parseBulkInventory(sampleBulkFile.name, sampleBulkFile.text);
    const { products: next, added, updated } = applyBulkImport(products, records);
    expect(added).toBe(1);
    expect(updated).toBe(2);
    expect(next).toHaveLength(products.length + 1);
    const fw16 = next.find((p) => p.sku === "FW-16-B")!;
    expect(fw16.id).toBe(products[0].id);
    expect(fw16.specifications).toEqual(products[0].specifications);
    expect(next.at(-1)).toMatchObject({ sku: "TD-MINI", status: "published", image: null });
  });

  it("lets drafts be incomplete but requires facts to publish", () => {
    const products = seedProducts();
    const draft = { ...draftFromProduct(null), name: "Dock", sku: "dock-1" };
    expect(validateDraft(draft, products, null, "draft").values).toMatchObject({ sku: "DOCK-1", minPrice: 0, stock: 0 });
    const strict = validateDraft(draft, products, null, "published");
    expect(Object.keys(strict.errors).sort()).toEqual(["category", "minPrice", "stock"]);
  });

  it("parses $ and unit text, and enforces unique SKU and min ≤ max", () => {
    const products = seedProducts();
    const draft = { ...draftFromProduct(null), name: "X", sku: "FW-13-A", category: "Laptops", minPrice: "$1,699", maxPrice: "$1,599", stock: "42 units" };
    const result = validateDraft(draft, products, null, "published");
    expect(result.errors.sku).toBeDefined();
    expect(result.errors.maxPrice).toBeDefined();
    const ok = validateDraft({ ...draft, sku: "NEW-1", maxPrice: "$1,799" }, products, null, "published");
    expect(ok.values).toMatchObject({ minPrice: 1699, maxPrice: 1799, stock: 42 });
    // Editing a product may keep its own SKU.
    const self = products.find((p) => p.sku === "FW-13-A")!;
    expect(validateDraft(draftFromProduct(self), products, self.id, "published").values).toBeDefined();
  });

  it("accepts a saved inventory file and rejects malformed ones", () => {
    const saved = JSON.parse(JSON.stringify({ ...initialInventory(), savedAt: 123 }));
    expect(parseInventory(saved)?.products).toHaveLength(6);
    expect(parseInventory({ products: [{ name: "x" }] })).toBeNull();
    expect(parseInventory({ nope: true })).toBeNull();
    expect(parseInventory(null)).toBeNull();
  });
});
