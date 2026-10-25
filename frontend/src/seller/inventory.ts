// Seller inventory model. Persisted by storage.ts (a JSON file under frontend/data in dev); never sent to the backend.

export type ProductOption = {
  id: string;
  name: string;
  required: boolean;
  choices: string[];
};

export type ProductStatus = "draft" | "published";

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  stock: number;
  description: string;
  specifications: ProductOption[];
  customizations: ProductOption[];
  status: ProductStatus;
  image: ProductImage | null;
  updatedAt: number;
};

export type ProductImage =
  | "framework-16"
  | "framework-13"
  | "framework-12"
  | "standing-desk"
  | "desk-kit"
  | "monitor-arm";

export type ActivityEntry = {
  id: string;
  message: string;
  at: number;
};

export type InventoryState = {
  products: Product[];
  activity: ActivityEntry[];
  savedAt: number | null;
};

export type StockLevel = "in" | "low" | "out";

export const lowStockThreshold = 20;
const activityLimit = 20;

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function option(name: string, choices: string[], required = true): ProductOption {
  return { id: newId("opt"), name, required, choices };
}

function seedProduct(
  input: Omit<Product, "id" | "updatedAt" | "specifications" | "customizations" | "description"> &
    Partial<Pick<Product, "specifications" | "customizations" | "description">>,
): Product {
  return {
    id: newId("prd"),
    description: "",
    specifications: [],
    customizations: [],
    updatedAt: Date.parse("2026-10-24T16:42:00.000Z"),
    ...input,
  };
}

export function seedProducts(): Product[] {
  return [
    seedProduct({
      name: "Framework Laptop 16",
      sku: "FW-16-B",
      category: "Laptops",
      minPrice: 1799,
      maxPrice: 1799,
      stock: 11,
      status: "draft",
      image: "framework-16",
      description: "Modular 16-inch laptop with repairable parts, a bright display, and all-day battery life.",
      specifications: [option("Materials", ["Leather finish", "Copper wiring"])],
      customizations: [option("Storage", ["512GB SSD", "1TB SSD", "2TB SSD"])],
    }),
    seedProduct({ name: "Framework Laptop 13", sku: "FW-13-A", category: "Laptops", minPrice: 1099, maxPrice: 1499, stock: 42, status: "published", image: "framework-13" }),
    seedProduct({ name: "Framework Laptop 12", sku: "FW-12-C", category: "Laptops", minPrice: 799, maxPrice: 999, stock: 36, status: "published", image: "framework-12" }),
    seedProduct({ name: "Standing Desk Frame", sku: "SD-FR-01", category: "Workspace", minPrice: 389, maxPrice: 499, stock: 27, status: "published", image: "standing-desk" }),
    seedProduct({ name: "Desk Kit Pro", sku: "DK-PRO", category: "Workspace", minPrice: 249, maxPrice: 349, stock: 18, status: "published", image: "desk-kit" }),
    seedProduct({ name: "4K Monitor Arm", sku: "MA-4K-01", category: "Accessories", minPrice: 119, maxPrice: 149, stock: 0, status: "published", image: "monitor-arm" }),
  ];
}

export function initialInventory(): InventoryState {
  return { products: seedProducts(), activity: [], savedAt: null };
}

function isOption(value: unknown): value is ProductOption {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.required === "boolean" &&
    Array.isArray(o.choices) && o.choices.every((c) => typeof c === "string");
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.sku === "string" &&
    typeof p.category === "string" && typeof p.minPrice === "number" && typeof p.maxPrice === "number" &&
    typeof p.stock === "number" && typeof p.description === "string" &&
    (p.status === "draft" || p.status === "published") &&
    Array.isArray(p.specifications) && p.specifications.every(isOption) &&
    Array.isArray(p.customizations) && p.customizations.every(isOption) &&
    typeof p.updatedAt === "number";
}

export function parseInventory(raw: unknown): InventoryState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<InventoryState>;
  if (!Array.isArray(parsed.products) || !parsed.products.every(isProduct)) return null;
  return {
    products: parsed.products,
    activity: Array.isArray(parsed.activity) ? parsed.activity.slice(0, activityLimit) : [],
    savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
  };
}

export function withActivity(state: InventoryState, message: string): InventoryState {
  const now = Date.now();
  return {
    ...state,
    activity: [{ id: newId("act"), message, at: now }, ...state.activity].slice(0, activityLimit),
    savedAt: now,
  };
}

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return "out";
  if (stock < lowStockThreshold) return "low";
  return "in";
}

export const stockLabels: Record<StockLevel, string> = {
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(value: number) {
  return dollars.format(value);
}

export function priceRange(product: Pick<Product, "minPrice" | "maxPrice">) {
  return product.minPrice === product.maxPrice
    ? money(product.minPrice)
    : `${money(product.minPrice)}–${money(product.maxPrice)}`;
}

export function displayName(product: Pick<Product, "name" | "status">) {
  return product.status === "draft" ? `[DRAFT] ${product.name}` : product.name;
}

export function matchesSearch(product: Product, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(q);
}

// ---- Product form validation ----

export type ProductDraft = {
  name: string;
  sku: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  stock: string;
  description: string;
  specifications: ProductOption[];
  customizations: ProductOption[];
};

export function draftFromProduct(product: Product | null): ProductDraft {
  if (!product) {
    return { name: "", sku: "", category: "", minPrice: "", maxPrice: "", stock: "", description: "", specifications: [], customizations: [] };
  }
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    minPrice: String(product.minPrice),
    maxPrice: String(product.maxPrice),
    stock: String(product.stock),
    description: product.description,
    specifications: product.specifications,
    customizations: product.customizations,
  };
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

function parseUnits(value: string) {
  const cleaned = value.replace(/units?/i, "").replace(/[,\s]/g, "");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

export type DraftErrors = Partial<Record<"name" | "sku" | "category" | "minPrice" | "maxPrice" | "stock", string>>;

export function validateDraft(
  draft: ProductDraft,
  products: Product[],
  editingId: string | null,
  mode: ProductStatus,
): { errors: DraftErrors; values?: Pick<Product, "name" | "sku" | "category" | "minPrice" | "maxPrice" | "stock"> } {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  const sku = draft.sku.trim().toUpperCase();
  const category = draft.category.trim();
  if (!name) errors.name = "Add a product name.";
  if (!sku) errors.sku = "Add a SKU.";
  else if (products.some((p) => p.sku.toUpperCase() === sku && p.id !== editingId)) errors.sku = "Another product already uses this SKU.";

  // Drafts may be incomplete; publishing requires every buyer-facing fact.
  const strict = mode === "published";
  let minPrice = parseAmount(draft.minPrice);
  let maxPrice = parseAmount(draft.maxPrice);
  let stock = parseUnits(draft.stock);
  if (strict && !category) errors.category = "Add a category.";
  if (Number.isNaN(minPrice) && Number.isNaN(maxPrice)) {
    if (strict) errors.minPrice = "Add a price.";
    minPrice = 0;
    maxPrice = 0;
  } else {
    if (Number.isNaN(minPrice)) minPrice = maxPrice;
    if (Number.isNaN(maxPrice)) maxPrice = minPrice;
    if (!Number.isFinite(minPrice) || minPrice < 0) errors.minPrice = "Use a price of $0 or more.";
    if (!Number.isFinite(maxPrice) || maxPrice < 0) errors.maxPrice = "Use a price of $0 or more.";
    else if (maxPrice < minPrice) errors.maxPrice = "Max price must be at least the min price.";
  }
  if (Number.isNaN(stock)) {
    if (strict) errors.stock = "Add a stock quantity.";
    stock = 0;
  } else if (!Number.isInteger(stock) || stock < 0) {
    errors.stock = "Use a whole number of units.";
  }
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, values: { name, sku, category, minPrice, maxPrice, stock } };
}

// ---- Bulk upload (JSON / JSONL) ----

export type BulkRecord = {
  line: number;
  name: string;
  sku: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  stock: number;
  description: string;
};

export type BulkIssue = { line: number; message: string };

export type BulkParseResult = {
  format: "JSON" | "JSONL";
  totalRows: number;
  records: BulkRecord[];
  issues: BulkIssue[];
};

export const maxBulkBytes = 1_000_000;
export const maxBulkRows = 500;

function readNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value.replace(/[$,\s]/g, ""));
  return NaN;
}

function toRecord(raw: unknown, line: number): BulkRecord | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Each record must be a JSON object.";
  const r = raw as Record<string, unknown>;
  const name = typeof r.title === "string" ? r.title.trim() : typeof r.name === "string" ? r.name.trim() : "";
  const sku = typeof r.sku === "string" ? r.sku.trim().toUpperCase() : "";
  const category = typeof r.category === "string" ? r.category.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  let minPrice: number;
  let maxPrice: number;
  if (r.price && typeof r.price === "object" && !Array.isArray(r.price)) {
    const range = r.price as Record<string, unknown>;
    minPrice = readNumber(range.min);
    maxPrice = readNumber(range.max ?? range.min);
  } else if (r.price !== undefined) {
    minPrice = maxPrice = readNumber(r.price);
  } else {
    minPrice = readNumber(r.min_price);
    maxPrice = readNumber(r.max_price ?? r.min_price);
  }
  const stock = readNumber(r.quantity ?? r.stock);
  const missing = [
    !name && "title",
    !sku && "sku",
    Number.isNaN(minPrice) && "price",
    Number.isNaN(stock) && "quantity",
  ].filter(Boolean);
  if (missing.length > 0) return `Missing ${missing.join(", ")}.`;
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice < 0 || maxPrice < minPrice) return "Price must be $0 or more, with max ≥ min.";
  if (!Number.isInteger(stock) || stock < 0) return "Quantity must be a whole number of units.";
  if (name.length > 120) return "Title is longer than 120 characters.";
  if (sku.length > 40) return "SKU is longer than 40 characters.";
  return { line, name, sku, category, minPrice, maxPrice, stock, description };
}

export function parseBulkInventory(fileName: string, text: string): BulkParseResult {
  const trimmed = text.trim();
  // .jsonl/.ndjson are always line-delimited; anything else is parsed as one document first
  // (so pretty-printed JSON works) and only falls back to line parsing if that fails.
  const explicitJsonl = /\.(jsonl|ndjson)$/i.test(fileName);
  const issues: BulkIssue[] = [];
  let rows: { raw: unknown; line: number }[] = [];
  let format: BulkParseResult["format"] = explicitJsonl ? "JSONL" : "JSON";
  let unreadable = 0;

  if (!explicitJsonl) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)
          ? (parsed as { products: unknown[] }).products
          : [parsed];
      rows = list.map((raw, i) => ({ raw, line: i + 1 }));
    } catch {
      format = "JSONL";
    }
  }
  if (format === "JSONL") {
    trimmed.split(/\r?\n/).forEach((lineText, i) => {
      if (!lineText.trim()) return;
      try {
        rows.push({ raw: JSON.parse(lineText), line: i + 1 });
      } catch {
        unreadable += 1;
        issues.push({ line: i + 1, message: "Not valid JSON." });
      }
    });
  }

  if (rows.length > maxBulkRows) {
    issues.push({ line: maxBulkRows + 1, message: `Only the first ${maxBulkRows} records are read.` });
    rows = rows.slice(0, maxBulkRows);
  }

  const records: BulkRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const result = toRecord(row.raw, row.line);
    if (typeof result === "string") {
      issues.push({ line: row.line, message: result });
    } else if (seen.has(result.sku)) {
      issues.push({ line: row.line, message: `Duplicate SKU ${result.sku} in this file.` });
    } else {
      seen.add(result.sku);
      records.push(result);
    }
  }
  return { format, totalRows: rows.length + unreadable, records, issues };
}

// Imported SKUs that already exist update that product in place; new SKUs are added.
export function applyBulkImport(products: Product[], records: BulkRecord[]): { products: Product[]; added: number; updated: number } {
  const now = Date.now();
  const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
  let added = 0;
  let updated = 0;
  const next = [...products];
  for (const r of records) {
    const existing = bySku.get(r.sku);
    if (existing) {
      const index = next.findIndex((p) => p.id === existing.id);
      next[index] = {
        ...existing,
        name: r.name,
        category: r.category || existing.category,
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        stock: r.stock,
        description: r.description || existing.description,
        updatedAt: now,
      };
      updated += 1;
    } else {
      next.push({
        id: newId("prd"),
        name: r.name,
        sku: r.sku,
        category: r.category,
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        stock: r.stock,
        description: r.description,
        specifications: [],
        customizations: [],
        status: "published",
        image: null,
        updatedAt: now,
      });
      added += 1;
    }
  }
  return { products: next, added, updated };
}

export const sampleBulkFile = {
  name: "vendor_inventory.jsonl",
  text: [
    { title: "Framework Laptop 16", sku: "FW-16-B", price: 1799, quantity: 11, category: "Laptops" },
    { title: "Framework Laptop 13", sku: "FW-13-A", price: { min: 1099, max: 1499 }, quantity: 42, category: "Laptops" },
    { title: "Travel Dock Mini", sku: "TD-MINI", price: 89, quantity: 64, category: "Accessories" },
  ].map((r) => JSON.stringify(r)).join("\n"),
};
