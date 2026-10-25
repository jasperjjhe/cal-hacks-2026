import type { ReactNode } from "react";
import { productImages, searchHandle, searchIcon } from "./assets.ts";
import { stockLabels, stockLevel } from "./inventory.ts";
import type { Product } from "./inventory.ts";

export function Tag({ tone, children }: { tone: "teal" | "neutral"; children: ReactNode }) {
  return <span className={`su-tag is-${tone}`}>{children}</span>;
}

export function StockPill({ stock }: { stock: number }) {
  const level = stockLevel(stock);
  return <span className={`su-stock is-${level}`}>{stockLabels[level]}</span>;
}

// Thumbnail tints follow the design: lavender by default, peach for drafts or low stock, rose when sold out.
function tintFor(product: Product) {
  const level = stockLevel(product.stock);
  if (level === "out") return "#ffebeb";
  if (product.status === "draft" || level === "low") return "#fff0e5";
  return "#ededff";
}

export function ProductIcon({ product }: { product: Product }) {
  return <span className="su-row-icon" style={{ background: tintFor(product) }} aria-hidden="true" />;
}

export function ProductImageBox({ product }: { product: Product }) {
  if (product.image) {
    return <img className="su-card-image" src={productImages[product.image]} alt="" />;
  }
  return (
    <span className="su-card-image is-placeholder" style={{ background: tintFor(product) }} aria-hidden="true">
      {product.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search products or SKUs",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="su-search">
      <span className="su-search-glyph" aria-hidden="true">
        <img src={searchIcon} alt="" width={11} height={11} />
        <img className="su-search-handle" src={searchHandle} alt="" width={5.6} height={5.6} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
