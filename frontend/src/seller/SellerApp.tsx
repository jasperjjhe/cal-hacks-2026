import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  avatarCoral,
  chevronDown,
  chevronRight,
  chevronsUpDown,
  inventoryIcon,
  analyticsIcon,
  ordersIcon,
  overviewIcon,
  productsIcon,
  workspaceIcon,
} from "./assets.ts";
import type { InventoryState, Product } from "./inventory.ts";
import { inventoryFilePath, loadInventory, saveInventory } from "./storage.ts";
import type { SaveResult, StorageMode } from "./storage.ts";
import SellerHome from "./SellerHome.tsx";
import InventoryPage from "./InventoryPage.tsx";
import ProductForm from "./ProductForm.tsx";
import ProductDetail from "./ProductDetail.tsx";
import BulkUpload from "./BulkUpload.tsx";
import Analytics from "./Analytics.tsx";
import Orders from "./Orders.tsx";
import "./seller.css";

export type SellerPage = "home" | "inventory" | "detail" | "product" | "bulk" | "analytics" | "orders";

const merchantName = "Northstar Computing";
const pageTitles: Record<SellerPage, string> = {
  home: "Home",
  inventory: "Inventory",
  detail: "Product",
  product: "Add product",
  bulk: "Bulk upload",
  analytics: "Analytics",
  orders: "Orders",
};

function savedLabel(savedAt: number | null, mode: StorageMode, result: SaveResult) {
  const where = mode === "file" ? "data/seller-inventory.json" : "this browser";
  if (result === "unsaved") return "Not saved · changes will be lost when you leave";
  if (result === "backup") return `Couldn’t write ${inventoryFilePath} · saved in this browser`;
  if (!savedAt) return `Sample inventory · ${where}`;
  const time = new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(savedAt).toDateString() === new Date().toDateString();
  return `Saved to ${where} · ${sameDay ? "today" : new Date(savedAt).toLocaleDateString("en-US")} ${time}`;
}

function NavButton({
  icon,
  label,
  active,
  trailing,
  onClick,
  sub,
}: {
  icon: string;
  label: string;
  active: boolean;
  trailing?: string;
  onClick: () => void;
  sub?: boolean;
}) {
  return (
    <button
      type="button"
      className={`su-nav-button${sub ? " is-sub" : ""}${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <img src={icon} alt="" width={16} height={16} />
      <span>{label}</span>
      {trailing && <img className="su-nav-trailing" src={trailing} alt="" width={16} height={16} />}
    </button>
  );
}

function WorkspaceBadge({ footer }: { footer?: boolean }) {
  return (
    <div className="su-workspace">
      {footer ? (
        <span className="su-avatar">
          <img src={avatarCoral} alt="" width={32} height={32} />
          <span>NC</span>
        </span>
      ) : (
        <span className="su-workspace-icon">
          <img src={workspaceIcon} alt="" width={16} height={16} />
        </span>
      )}
      <span className="su-workspace-copy">
        <strong>{merchantName}</strong>
        <small>merchant workspace</small>
      </span>
      <img src={chevronsUpDown} alt="" width={16} height={16} />
    </div>
  );
}

type Loaded = { state: InventoryState; mode: StorageMode; needsSave: boolean };

export default function SellerApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    void loadInventory().then((result) => live && setLoaded(result));
    return () => {
      live = false;
    };
  }, []);
  if (!loaded) {
    return (
      <div className="seller-app su-loading" role="status">
        Loading inventory…
      </div>
    );
  }
  return <Workspace {...loaded} />;
}

function Workspace({ state, mode, needsSave }: Loaded) {
  const [inventory, setInventory] = useState<InventoryState>(state);
  const [page, setPage] = useState<SellerPage>("home");
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saveResult, setSaveResult] = useState<SaveResult>("saved");
  // Write out sample data on first run or a recovered browser copy; otherwise only save after a change.
  const skipSave = useRef(!needsSave);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    void saveInventory(inventory, mode).then(setSaveResult);
  }, [inventory, mode]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  function go(next: SellerPage) {
    setEditing(null);
    setViewingId(null);
    setNotice("");
    setPage(next);
  }
  function openProduct(product: Product | null) {
    setEditing(product);
    setNotice("");
    setPage("product");
  }
  function openDetail(id: string) {
    setEditing(null);
    setViewingId(id);
    setNotice("");
    setPage("detail");
  }
  function openInventory(message = "") {
    setEditing(null);
    setViewingId(null);
    setNotice(message);
    setPage("inventory");
  }

  let content: ReactNode;
  if (page === "home") {
    content = (
      <SellerHome
        products={inventory.products}
        activity={inventory.activity}
        merchantName="Northstar"
        onInventory={() => openInventory()}
        onAddProduct={() => openProduct(null)}
        onAnalytics={() => go("analytics")}
      />
    );
  } else if (page === "inventory") {
    content = (
      <InventoryPage
        products={inventory.products}
        notice={notice}
        onAddProduct={() => openProduct(null)}
        onBulkUpload={() => go("bulk")}
        onOpen={(p) => openDetail(p.id)}
        onEdit={openProduct}
      />
    );
  } else if (page === "bulk") {
    content = (
      <BulkUpload
        products={inventory.products}
        onCancel={() => openInventory()}
        onImported={(apply, message) => {
          setInventory(apply);
          openInventory(message);
        }}
      />
    );
  } else if (page === "product") {
    content = (
      <ProductForm
        key={editing?.id ?? "new"}
        editing={editing}
        inventory={inventory}
        setInventory={setInventory}
        onDone={(id) => (id ? openDetail(id) : openInventory())}
      />
    );
  } else if (page === "detail") {
    const product = inventory.products.find((p) => p.id === viewingId);
    content = product ? (
      <ProductDetail product={product} onBack={() => openInventory()} onEdit={() => openProduct(product)} />
    ) : (
      <section className="su-placeholder">
        <h1 className="su-page-title">Product not found</h1>
        <p>It may have been removed.</p>
      </section>
    );
  } else if (page === "analytics") {
    content = <Analytics products={inventory.products} />;
  } else {
    content = <Orders />;
  }

  const viewing = page === "detail" ? inventory.products.find((p) => p.id === viewingId) : undefined;
  const title = page === "product" && editing ? "Edit product" : viewing ? viewing.name : pageTitles[page];
  return (
    <div className="seller-app">
      <aside className="su-sidebar" aria-label="Merchant navigation">
        <WorkspaceBadge />
        <nav className="su-nav">
          <span className="su-nav-label">MERCHANT</span>
          <NavButton icon={overviewIcon} label="Overview" active={page === "home"} trailing={chevronDown} onClick={() => go("home")} />
          <div className="su-nav-sub">
            <NavButton sub icon={inventoryIcon} label="Inventory" active={page === "inventory" || page === "detail" || page === "product" || page === "bulk"} onClick={() => openInventory()} />
            <NavButton sub icon={analyticsIcon} label="Analytics" active={page === "analytics"} onClick={() => go("analytics")} />
          </div>
          <NavButton icon={productsIcon} label="Products" active={false} trailing={chevronRight} onClick={() => openInventory()} />
          <NavButton icon={ordersIcon} label="Orders" active={page === "orders"} trailing={chevronRight} onClick={() => go("orders")} />
        </nav>
        <div className="su-sidebar-footer">
          <WorkspaceBadge footer />
        </div>
      </aside>
      <div className="su-main">
        <header className="su-header">
          <div>
            <small>Merchant workspace</small>
            <strong>
              {merchantName} · {title}
            </strong>
          </div>
          <span className={`su-synced${saveResult !== "saved" ? " is-warning" : ""}`}>{savedLabel(inventory.savedAt, mode, saveResult)}</span>
        </header>
        <main className="su-content">{content}</main>
      </div>
    </div>
  );
}
