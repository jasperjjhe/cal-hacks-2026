import { useState } from "react";
import { uploadIcon } from "./assets.ts";
import { displayName, matchesSearch, money, priceRange } from "./inventory.ts";
import type { Product } from "./inventory.ts";
import { ProductIcon, ProductImageBox, SearchBox, StockPill } from "./ui.tsx";

type View = "list" | "grid";
const viewKey = "buyerunion.seller.view.v1";
const pageSize: Record<View, number> = { list: 8, grid: 9 };

function initialView(): View {
  try {
    return localStorage.getItem(viewKey) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="su-pagination" aria-label="Inventory pages">
      {Array.from({ length: pages }, (_, i) => (
        <button
          key={i}
          type="button"
          className={i === page ? "is-current" : undefined}
          aria-current={i === page ? "page" : undefined}
          onClick={() => onPage(i)}
        >
          {i + 1}
        </button>
      ))}
      <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </nav>
  );
}

export default function InventoryPage({
  products,
  notice,
  onAddProduct,
  onBulkUpload,
  onOpen,
  onEdit,
}: {
  products: Product[];
  notice: string;
  onAddProduct: () => void;
  onBulkUpload: () => void;
  onOpen: (product: Product) => void;
  onEdit: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [page, setPage] = useState(0);

  const filtered = products.filter((p) => matchesSearch(p, query));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize[view]));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize[view], (current + 1) * pageSize[view]);

  function changeView(next: View) {
    setView(next);
    setPage(0);
    try {
      localStorage.setItem(viewKey, next);
    } catch {
      // View preference is cosmetic.
    }
  }

  return (
    <div className="su-inventory">
      <h1 className="su-page-title">Inventory</h1>
      <div className="su-toolbar">
        <SearchBox
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
        <button type="button" className="su-bulk-entry" onClick={onBulkUpload}>
          <img src={uploadIcon} alt="" width={16} height={16} />
          Bulk upload
        </button>
        <div className="su-toolbar-end">
          <div className="su-view-toggle" role="radiogroup" aria-label="Inventory layout">
            <button type="button" role="radio" aria-checked={view === "grid"} aria-label="Grid view" className={view === "grid" ? "is-active" : undefined} onClick={() => changeView("grid")}>
              <span className="su-glyph-grid" aria-hidden="true"><i /><i /><i /><i /></span>
            </button>
            <button type="button" role="radio" aria-checked={view === "list"} aria-label="List view" className={view === "list" ? "is-active" : undefined} onClick={() => changeView("list")}>
              <span className="su-glyph-list" aria-hidden="true"><i /><i /><i /></span>
            </button>
          </div>
          <button type="button" className="su-add-button" onClick={onAddProduct}>
            +&nbsp;&nbsp;Add product
          </button>
        </div>
      </div>

      {notice && (
        <p className="su-notice" role="status">
          {notice}
        </p>
      )}

      <section className={`su-panel su-inventory-panel is-${view}`} aria-label="Products">
        {filtered.length === 0 ? (
          <p className="su-empty su-inventory-empty">
            {query ? `No products match “${query}”.` : "No products yet. Add one or bulk upload a file."}
          </p>
        ) : view === "list" ? (
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
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="su-row-product">
                      <ProductIcon product={p} />
                      <span>
                        <button type="button" className="su-row-name" onClick={() => onOpen(p)}>
                          {displayName(p)}
                        </button>
                        <small>{p.sku}</small>
                      </span>
                    </div>
                  </td>
                  <td className="su-row-price">{priceRange(p)}</td>
                  <td className="su-row-stock">{p.stock} units</td>
                  <td>
                    <StockPill stock={p.stock} />
                  </td>
                  <td className="is-end">
                    <button type="button" className="su-link" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="su-grid">
            {visible.map((p) => (
              <li key={p.id}>
                <button type="button" className="su-card" onClick={() => onOpen(p)} aria-label={`View ${p.name}`}>
                  <ProductImageBox product={p} />
                  <span className="su-card-title">
                    <strong>{displayName(p)}</strong>
                    <strong>{money(p.minPrice)}</strong>
                  </span>
                  <span className="su-card-meta">
                    <span>{p.stock} units</span>
                    <StockPill stock={p.stock} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} />
      </section>
    </div>
  );
}
