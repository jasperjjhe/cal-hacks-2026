import { useId, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { plusIcon } from "./assets.ts";
import { draftFromProduct, newId, validateDraft, withActivity } from "./inventory.ts";
import type { DraftErrors, InventoryState, Product, ProductDraft, ProductOption, ProductStatus } from "./inventory.ts";
import { Tag } from "./ui.tsx";

function OptionGroup({
  title,
  addLabel,
  options,
  onChange,
}: {
  title: string;
  addLabel: string;
  options: ProductOption[];
  onChange: (options: ProductOption[]) => void;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [choices, setChoices] = useState("");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState("");

  function reset() {
    setAdding(false);
    setName("");
    setChoices("");
    setRequired(true);
    setError("");
  }
  function add() {
    const list = choices.split(",").map((c) => c.trim()).filter(Boolean);
    if (!name.trim() || list.length === 0) {
      setError("Add a name and at least one choice.");
      return;
    }
    onChange([...options, { id: newId("opt"), name: name.trim(), required, choices: list }]);
    reset();
  }

  return (
    <fieldset className="su-options">
      <legend>{title}</legend>
      {options.map((option) => (
        <div className="su-option" key={option.id}>
          <div className="su-option-header">
            <strong>{option.name}</strong>
            <span className="su-option-tools">
              <Tag tone="neutral">{option.required ? "Required" : "Optional"}</Tag>
              <button
                type="button"
                className="su-link is-small"
                onClick={() => onChange(options.filter((o) => o.id !== option.id))}
                aria-label={`Remove ${option.name}`}
              >
                Remove
              </button>
            </span>
          </div>
          <div className="su-choices">
            {option.choices.map((choice) => (
              <span className="su-choice" key={choice}>
                {choice}
                <button
                  type="button"
                  aria-label={`Remove ${choice}`}
                  onClick={() =>
                    onChange(
                      options
                        .map((o) => (o.id === option.id ? { ...o, choices: o.choices.filter((c) => c !== choice) } : o))
                        .filter((o) => o.choices.length > 0),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
      {adding ? (
        <div className="su-option-editor">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RAM" autoFocus />
          <label htmlFor={`${id}-choices`}>Choices (comma-separated)</label>
          <input id={`${id}-choices`} value={choices} onChange={(e) => setChoices(e.target.value)} placeholder="16GB, 32GB, 64GB" />
          <label className="su-checkbox">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Buyers must pick one
          </label>
          {error && <p className="su-field-error">{error}</p>}
          <div className="su-option-editor-actions">
            <button type="button" className="su-button is-secondary is-small" onClick={reset}>
              Cancel
            </button>
            <button type="button" className="su-button is-primary is-small" onClick={add}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="su-add-row" onClick={() => setAdding(true)}>
          <span>
            <img src={plusIcon} alt="" width={16} height={16} />
            {addLabel}
          </span>
          <small>e.g. RAM, color</small>
        </button>
      )}
    </fieldset>
  );
}

function Field({
  id,
  label,
  error,
  strong,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  strong?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`su-field${className ? ` ${className}` : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id} className={strong ? "is-strong" : undefined}>
        {label}
      </label>
      {children}
      {error && (
        <p className="su-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function ProductForm({
  editing,
  inventory,
  setInventory,
  onDone,
}: {
  editing: Product | null;
  inventory: InventoryState;
  setInventory: Dispatch<SetStateAction<InventoryState>>;
  onDone: (productId: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ProductDraft>(() => draftFromProduct(editing));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function save(status: ProductStatus) {
    const { errors: found, values } = validateDraft(draft, inventory.products, editing?.id ?? null, status);
    setErrors(found);
    if (!values) {
      document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    const product: Product = {
      id: editing?.id ?? newId("prd"),
      image: editing?.image ?? null,
      ...values,
      description: draft.description.trim(),
      specifications: draft.specifications,
      customizations: draft.customizations,
      status,
      updatedAt: Date.now(),
    };
    const verb = editing ? (status === "published" && editing.status === "draft" ? "Published" : "Updated") : status === "published" ? "Published" : "Saved draft of";
    setInventory((state) =>
      withActivity(
        {
          ...state,
          products: editing ? state.products.map((p) => (p.id === editing.id ? product : p)) : [product, ...state.products],
        },
        `${verb} ${product.name} (${product.sku}).`,
      ),
    );
    onDone(product.id);
  }

  function remove() {
    if (!editing) return;
    setInventory((state) =>
      withActivity({ ...state, products: state.products.filter((p) => p.id !== editing.id) }, `Removed ${editing.name} (${editing.sku}).`),
    );
    onDone(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save("published");
  }

  const published = editing?.status === "published";
  const describedBy = (key: keyof DraftErrors) => (errors[key] ? `${id}-${key}-error` : undefined);

  return (
    <form className="su-product" onSubmit={onSubmit} noValidate>
      <div className="su-product-head">
        <div>
          <h1 className="su-page-title">{editing ? "Edit product" : "Add a product"}</h1>
          <p className="su-lede">Create a buyer-ready listing with clear facts, pricing, and availability.</p>
        </div>
        <span className={`su-draft-pill${published ? " is-published" : ""}`}>
          {published ? "PUBLISHED · VISIBLE TO AGENTS" : "DRAFT · NOT PUBLISHED"}
        </span>
      </div>

      <section className="su-panel su-form-panel" aria-labelledby={`${id}-details`}>
        <h2 id={`${id}-details`} className="su-form-title">
          Product details
        </h2>
        <div className="su-form-grid">
          <Field id={`${id}-name`} label="Product name" strong error={errors.name} className="is-full">
            <input id={`${id}-name`} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Framework Laptop 16" aria-invalid={!!errors.name} aria-describedby={describedBy("name")} maxLength={120} />
          </Field>
          <Field id={`${id}-sku`} label="SKU" strong error={errors.sku} className="is-half">
            <input id={`${id}-sku`} value={draft.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder="FW-16-B" aria-invalid={!!errors.sku} aria-describedby={describedBy("sku")} maxLength={40} />
          </Field>
          <Field id={`${id}-category`} label="Category" error={errors.category} className="is-half">
            <input id={`${id}-category`} value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="Laptops" list={`${id}-categories`} aria-invalid={!!errors.category} aria-describedby={describedBy("category")} />
            <datalist id={`${id}-categories`}>
              {[...new Set(inventory.products.map((p) => p.category).filter(Boolean))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field id={`${id}-minPrice`} label="Min price" strong error={errors.minPrice} className="is-third">
            <input id={`${id}-minPrice`} value={draft.minPrice} onChange={(e) => set("minPrice", e.target.value)} placeholder="$1,699" inputMode="decimal" aria-invalid={!!errors.minPrice} aria-describedby={describedBy("minPrice")} />
          </Field>
          <Field id={`${id}-maxPrice`} label="Max price" error={errors.maxPrice} className="is-third">
            <input id={`${id}-maxPrice`} value={draft.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} placeholder="$1,799" inputMode="decimal" aria-invalid={!!errors.maxPrice} aria-describedby={describedBy("maxPrice")} />
          </Field>
          <Field id={`${id}-stock`} label="Stock" error={errors.stock} className="is-third">
            <input id={`${id}-stock`} value={draft.stock} onChange={(e) => set("stock", e.target.value)} placeholder="42 units" inputMode="numeric" aria-invalid={!!errors.stock} aria-describedby={describedBy("stock")} />
          </Field>
          <Field id={`${id}-description`} label="Description" strong className="is-full">
            <textarea id={`${id}-description`} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Modular 16-inch laptop with repairable parts, a bright display, and all-day battery life." rows={8} maxLength={2000} />
          </Field>
        </div>
        <OptionGroup title="Product specifications" addLabel="Add specification" options={draft.specifications} onChange={(o) => set("specifications", o)} />
        <OptionGroup title="Product customizations" addLabel="Add customization" options={draft.customizations} onChange={(o) => set("customizations", o)} />
      </section>

      <footer className="su-form-footer">
        <div className="su-form-footer-note">
          <small>You can edit these facts later from Inventory.</small>
          {editing &&
            (confirmDelete ? (
              <span className="su-delete-confirm">
                Remove this product?
                <button type="button" className="su-link is-danger" onClick={remove}>
                  Remove
                </button>
                <button type="button" className="su-link" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="su-link is-danger is-small" onClick={() => setConfirmDelete(true)}>
                Remove product
              </button>
            ))}
        </div>
        <div className="su-form-actions">
          <button type="button" className="su-form-button" onClick={() => onDone(editing?.id ?? null)}>
            Cancel
          </button>
          <button type="button" className="su-form-button is-draft" onClick={() => save("draft")}>
            Save draft
          </button>
          <button type="submit" className="su-form-button is-publish">
            {published ? "Save changes" : "Publish product"}
          </button>
        </div>
      </footer>
    </form>
  );
}
