import { bookmarkIcon, mascot, packageIcon } from "./assets.ts";
import { stockLevel } from "./inventory.ts";
import type { ActivityEntry, Product } from "./inventory.ts";
import { Tag } from "./ui.tsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function activityTime(at: number) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Agent appearances, conversion and revenue have no data source yet; they are demo figures from the design.
const demoMetrics = [
  { label: "Agent appearances", value: "1,240", delta: "+18% this week", note: "Qualified demand" },
  { label: "Agent conversion", value: "8.6%", delta: "+1.2 pts this week", note: "Appearances to orders" },
  { label: "Gross revenue", value: "$222.8k", delta: "+18.4% QoQ", note: "Past quarter" },
];

export default function SellerHome({
  products,
  activity,
  merchantName,
  onInventory,
  onAddProduct,
  onAnalytics,
}: {
  products: Product[];
  activity: ActivityEntry[];
  merchantName: string;
  onInventory: () => void;
  onAddProduct: () => void;
  onAnalytics: () => void;
}) {
  const lowStock = products.filter((p) => stockLevel(p.stock) !== "in").length;
  const drafts = products.filter((p) => p.status === "draft").length;
  const metrics = [
    demoMetrics[0],
    { label: "Inventory items", value: String(products.length), delta: `${lowStock} low stock`, note: "Across all categories" },
    demoMetrics[1],
    demoMetrics[2],
  ];
  return (
    <div className="su-home">
      <h1 className="su-page-title">
        {greeting()}, {merchantName}.
      </h1>
      <p className="su-lede">Here’s an overview of your merchant workspace. Pick up where you left off.</p>

      <div className="su-metrics">
        {metrics.map((m) => (
          <div className="su-metric" key={m.label}>
            <span className="su-metric-label">{m.label}</span>
            <strong className="su-metric-value">{m.value}</strong>
            <span className="su-metric-delta">{m.delta}</span>
            <span className="su-metric-note">{m.note}</span>
          </div>
        ))}
      </div>

      <div className="su-features">
        <article className="su-feature">
          <div className="su-feature-icons">
            <span className="su-feature-icon" style={{ background: "#edf0fc" }}>
              <img src={packageIcon} alt="" width={16} height={16} />
            </span>
            <Tag tone="teal">{lowStock} low stock</Tag>
          </div>
          <h2>Manage inventory</h2>
          <p>
            View and update your {products.length} products. Track stock levels, prices, and availability across all
            categories.
          </p>
          <button type="button" className="su-button is-primary" onClick={onInventory}>
            Go to Inventory
          </button>
        </article>
        <article className="su-feature">
          <div className="su-feature-icons">
            <span className="su-feature-icon" style={{ background: "#fef1d0" }}>
              <img src={bookmarkIcon} alt="" width={24} height={24} />
            </span>
            <Tag tone="neutral">{drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"} ready` : "No drafts"}</Tag>
          </div>
          <h2>Add a product</h2>
          <p>Create a buyer-ready listing with pricing, stock, customizations, and an evidence checklist for your agent.</p>
          <button type="button" className="su-button is-secondary" onClick={onAddProduct}>
            Add product
          </button>
        </article>
        <article className="su-feature">
          <div className="su-feature-icons">
            <span className="su-feature-icon">
              <img src={mascot} alt="" width={38.4814} height={36.0008} />
            </span>
            <Tag tone="teal">AI insights</Tag>
          </div>
          <h2>Agent analytics</h2>
          <p>Review AI-generated summaries, agent appearances, margin projections, and product sales breakdowns.</p>
          <button type="button" className="su-button is-secondary" onClick={onAnalytics}>
            View analytics
          </button>
        </article>
      </div>

      <section className="su-activity" aria-labelledby="su-activity-title">
        <h2 id="su-activity-title">Inventory Activity</h2>
        {activity.length === 0 ? (
          <p className="su-empty">No inventory changes yet. Edits, new products, and imports will show up here.</p>
        ) : (
          <ul>
            {activity.map((entry) => (
              <li key={entry.id}>
                <span>{entry.message}</span>
                <time dateTime={new Date(entry.at).toISOString()}>{activityTime(entry.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
