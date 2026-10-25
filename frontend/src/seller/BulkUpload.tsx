import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { chevronRight } from "./assets.ts";
import {
  applyBulkImport,
  maxBulkBytes,
  parseBulkInventory,
  priceRange,
  sampleBulkFile,
  stockLevel,
  withActivity,
} from "./inventory.ts";
import type { BulkIssue, BulkRecord, InventoryState, Product } from "./inventory.ts";
import { StockPill } from "./ui.tsx";
import { clearPendingUpload, loadPendingUpload, savePendingUpload } from "./pendingUpload.ts";
import type { PendingUpload } from "./pendingUpload.ts";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const tint = { in: "#ededff", low: "#fff0e5", out: "#ffebeb" } as const;

// A later upload with the same SKU replaces the earlier pending row.
function merge(current: BulkRecord[], incoming: BulkRecord[]) {
  const bySku = new Map(current.map((r) => [r.sku, r]));
  for (const r of incoming) bySku.set(r.sku, r);
  return [...bySku.values()];
}

export default function BulkUpload({
  products,
  onCancel,
  onImported,
}: {
  products: Product[];
  onCancel: () => void;
  onImported: (apply: (state: InventoryState) => InventoryState, message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload>(() => loadPendingUpload() ?? { fileName: "", records: [] });
  const [issues, setIssues] = useState<BulkIssue[]>([]);
  const [error, setError] = useState("");
  const [tooLarge, setTooLarge] = useState(false);
  const [dragging, setDragging] = useState(false);

  function commit(next: PendingUpload) {
    setPending(next);
    setTooLarge(!savePendingUpload(next));
  }

  function load(fileName: string, text: string) {
    setError("");
    const result = parseBulkInventory(fileName, text);
    setIssues(result.issues);
    if (result.records.length === 0) {
      setError(result.totalRows === 0 ? `${fileName} has no records.` : `No valid records in ${fileName}.`);
      return;
    }
    commit({
      fileName: pending.fileName && !pending.fileName.split(", ").includes(fileName) ? `${pending.fileName}, ${fileName}` : fileName,
      records: merge(pending.records, result.records),
    });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(jsonl?|ndjson)$/i.test(file.name)) {
      setError("Choose a .json or .jsonl file.");
      return;
    }
    if (file.size > maxBulkBytes) {
      setError("That file is larger than 1 MB. Split it into smaller uploads.");
      return;
    }
    load(file.name, await file.text());
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  }

  function clear() {
    commit({ fileName: "", records: [] });
    setIssues([]);
    setError("");
  }

  function runImport() {
    const records = pending.records;
    if (records.length === 0) return;
    const { added, updated } = applyBulkImport(products, records);
    const parts = [added && `added ${plural(added, "product")}`, updated && `updated ${plural(updated, "product")}`].filter(Boolean);
    const message = `Bulk upload from ${pending.fileName}: ${parts.join(" and ")}.`;
    clearPendingUpload();
    onImported(
      (state) => withActivity({ ...state, products: applyBulkImport(state.products, records).products }, message),
      message,
    );
  }

  const existingSkus = new Set(products.map((p) => p.sku.toUpperCase()));
  const records = pending.records;

  return (
    <div className="su-bulk-page">
      <nav className="su-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="su-link" onClick={onCancel}>
          Inventory
        </button>
        <img src={chevronRight} alt="" width={16} height={16} />
        <span aria-current="page">Bulk upload</span>
      </nav>
      <h1 className="su-page-title">Bulk upload</h1>
      <p className="su-lede">Upload a JSON or JSONL file of products. Review the list, then add it to your inventory.</p>

      <div className="su-toolbar">
        <input
          ref={input}
          type="file"
          accept=".json,.jsonl,.ndjson,application/json"
          hidden
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="su-link su-sample-link" onClick={() => load(sampleBulkFile.name, sampleBulkFile.text)}>
          Use the sample file
        </button>
        <div className="su-toolbar-end">
          {records.length > 0 && (
            <button type="button" className="su-button is-secondary" onClick={clear}>
              Clear list
            </button>
          )}
          <button type="button" className="su-add-button" disabled={records.length === 0} onClick={runImport}>
            {records.length > 0 ? `Add ${plural(records.length, "item")} to inventory` : "Add to inventory"}
          </button>
        </div>
      </div>

      {error && (
        <p className="su-notice is-error" role="alert">
          {error}
        </p>
      )}
      {issues.length > 0 && (
        <div className="su-notice is-warning" role="status">
          <strong>{plural(issues.length, "row")} skipped</strong>
          <ul>
            {issues.slice(0, 5).map((issue, i) => (
              <li key={i}>
                Line {issue.line}: {issue.message}
              </li>
            ))}
            {issues.length > 5 && <li>+ {issues.length - 5} more</li>}
          </ul>
        </div>
      )}
      {tooLarge && (
        <p className="su-notice is-warning" role="status">
          This upload is too large to keep in this browser, so it will be lost if you reload before adding it.
        </p>
      )}

      <section
        className={`su-panel su-inventory-panel is-list su-upload-list${dragging ? " is-dragging" : ""}`}
        aria-label="Uploaded items"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {records.length === 0 ? (
          <button type="button" className="su-upload-empty" onClick={() => input.current?.click()}>
            <strong>No items uploaded yet</strong>
            <span>Drop a JSON or JSONL file here, or choose one from your device.</span>
          </button>
        ) : (
          <table className="su-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Price Range</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col" className="is-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.sku}>
                  <td>
                    <div className="su-row-product">
                      <span className="su-row-icon" style={{ background: tint[stockLevel(r.stock)] }} aria-hidden="true" />
                      <span>
                        <strong>{r.name}</strong>
                        <small>
                          {r.sku} · {existingSkus.has(r.sku) ? "updates existing product" : "new product"}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td className="su-row-price">{priceRange(r)}</td>
                  <td className="su-row-stock">{r.stock} units</td>
                  <td>
                    <StockPill stock={r.stock} />
                  </td>
                  <td className="is-end">
                    <button
                      type="button"
                      className="su-link is-danger"
                      onClick={() => commit({ ...pending, records: pending.records.filter((x) => x.sku !== r.sku) })}
                      aria-label={`Remove ${r.name} from upload`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {records.length > 0 && <p className="su-upload-source">From {pending.fileName}</p>}
    </div>
  );
}
