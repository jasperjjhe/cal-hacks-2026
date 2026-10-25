import { chevronRight } from "./assets.ts";
import { priceRange, stockLevel } from "./inventory.ts";
import type { Product, ProductOption } from "./inventory.ts";
import { ProductImageBox, StockPill, Tag } from "./ui.tsx";

function OptionList({ title, options, empty }: { title: string; options: ProductOption[]; empty: string }) {
  return (
    <section className="su-panel su-detail-card" aria-label={title}>
      <h2>{title}</h2>
      {options.length === 0 ? (
        <p className="su-empty">{empty}</p>
      ) : (
        options.map((option) => (
          <div className="su-option" key={option.id}>
            <div className="su-option-header">
              <strong>{option.name}</strong>
              <Tag tone="neutral">{option.required ? "Required" : "Optional"}</Tag>
            </div>
            <div className="su-choices">
              {option.choices.map((choice) => (
                <span className="su-choice" key={choice}>
                  {choice}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export default function ProductDetail({
  product,
  onBack,
  onEdit,
}: {
  product: Product;
  onBack: () => void;
  onEdit: () => void;
}) {
  const level = stockLevel(product.stock);
  const updated = new Date(product.updatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const facts = [
    { label: "SKU", value: product.sku },
    { label: "Category", value: product.category || "—" },
    { label: "Price range", value: priceRange(product) },
    { label: "Stock", value: `${product.stock} units` },
    { label: "Last updated", value: updated },
  ];

  return (
    <div className="su-detail">
      <nav className="su-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="su-link" onClick={onBack}>
          Inventory
        </button>
        <img src={chevronRight} alt="" width={16} height={16} />
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className="su-panel su-detail-hero">
        <div className="su-detail-media">
          <ProductImageBox product={product} />
        </div>
        <div className="su-detail-summary">
          <div className="su-detail-tags">
            <span className={`su-draft-pill${product.status === "published" ? " is-published" : ""}`}>
              {product.status === "published" ? "PUBLISHED · VISIBLE TO AGENTS" : "DRAFT · NOT PUBLISHED"}
            </span>
            <StockPill stock={product.stock} />
          </div>
          <h1 className="su-page-title">{product.name}</h1>
          <p className="su-detail-price">{priceRange(product)}</p>
          <dl className="su-detail-facts">
            {facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          {level !== "in" && (
            <p className="su-detail-alert">
              {level === "out"
                ? "Out of stock — buyer agents won’t be offered this product until you restock."
                : "Low stock — consider restocking so this product stays eligible for larger requests."}
            </p>
          )}
          <div className="su-detail-actions">
            <button type="button" className="su-button is-primary" onClick={onEdit}>
              Edit product
            </button>
            <button type="button" className="su-button is-secondary" onClick={onBack}>
              Back to inventory
            </button>
          </div>
        </div>
      </section>

      <section className="su-panel su-detail-card" aria-label="Description">
        <h2>Description</h2>
        {product.description ? (
          <p className="su-detail-description">{product.description}</p>
        ) : (
          <p className="su-empty">No description yet. Buyer agents rely on clear facts — add one from Edit product.</p>
        )}
      </section>

      <div className="su-detail-options">
        <OptionList title="Product specifications" options={product.specifications} empty="No specifications listed." />
        <OptionList title="Product customizations" options={product.customizations} empty="No customizations offered." />
      </div>
    </div>
  );
}
