import { useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { OfferCard } from "../contracts";
import { ArrowUpRight } from "./ui";
import { dayLabel, fullDayLabel, money, price } from "./format";
import { photoClass, productVisual } from "./visuals";
import type { SavedOffer } from "./Home";

const at = (i: number) => ({ "--i": i }) as CSSProperties;
const applicabilityNames = { exact_variant: "Exact model", family: "Same product family" } as const;
const verificationNames = {
  supported: "supports the claim",
  contradicted: "contradicts the claim",
  unknown: "not verified",
} as const;
const sourceNames = {
  manufacturer: "Manufacturer",
  independent_test: "Independent test",
  owner_report: "Owner report",
} as const;

type Evidence = NonNullable<FunctionReturnType<typeof api.buyer.getEvidence>>[number];

const EXCERPT_CHARS = 280;
const SHOWN = 3;

function EvidenceItem({ e, index }: { e: Evidence; index: number }) {
  const [open, setOpen] = useState(false);
  const long = e.excerpt.length > EXCERPT_CHARS;
  return (
    <article className="cv-evidence" style={at(index)}>
      <header>
        <span className={`cv-source is-${e.sourceType}`}>{sourceNames[e.sourceType]}</span>
        <a href={e.url} target="_blank" rel="noreferrer">
          Open source <ArrowUpRight size={12} />
        </a>
      </header>
      <p className="cv-claim">{e.claim}</p>
      <blockquote>
        {long && !open ? `${e.excerpt.slice(0, EXCERPT_CHARS).trimEnd()}…` : e.excerpt}
        {long && (
          <button className="cv-linkish" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Show less" : "Read more"}
          </button>
        )}
      </blockquote>
      <p className="cv-footnote">
        {applicabilityNames[e.applicability]}, {verificationNames[e.verification]}. Retrieved{" "}
        {fullDayLabel(e.retrievedAt)}.
        {e.sourceVerifiedPurchaseLabel && ` The source labels it “${e.sourceVerifiedPurchaseLabel}”.`}
      </p>
    </article>
  );
}

/** First few excerpts, with the rest one click away so a long list never buries the page. */
function EvidenceStack({ items }: { items: Evidence[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      {shown.map((e, i) => (
        <EvidenceItem key={e.id} e={e} index={i} />
      ))}
      {items.length > SHOWN && (
        <button className="cv-secondary cv-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length} excerpts`}
        </button>
      )}
    </>
  );
}

export function EvidenceList({
  requestId,
  runId,
  ids,
}: {
  requestId: string;
  runId?: string;
  ids: string[];
}) {
  const evidence = useQuery(
    api.buyer.getEvidence,
    ids.length ? { requestId, evidenceIds: ids, ...(runId ? { runId } : {}) } : "skip",
  );
  if (!ids.length)
    return (
      <p className="cv-empty">
        No applicable independent or owner evidence is available for this offer. No ratings or
        reviews have been invented.
      </p>
    );
  if (!evidence) return <p className="cv-empty" role="status">Loading source excerpts…</p>;
  if (!evidence.length)
    return <p className="cv-empty">These source excerpts are no longer available.</p>;
  return (
    <div className="cv-evidence-list">
      <EvidenceStack items={evidence} />
    </div>
  );
}

/** Every excerpt behind the current offers, grouped by product. */
export function EvidenceView({
  requestId,
  runId,
  cards,
  query,
}: {
  requestId: string;
  runId: string;
  cards: OfferCard[];
  query: string;
}) {
  const ids = [...new Set(cards.flatMap((c) => c.evidenceIds))].slice(0, 40);
  const evidence = useQuery(
    api.buyer.getEvidence,
    ids.length ? { requestId, runId, evidenceIds: ids } : "skip",
  );
  const q = query.trim().toLowerCase();
  return (
    <section className="cv-page" aria-labelledby="cv-evidence-title">
      <h1 id="cv-evidence-title">Evidence behind your offers</h1>
      <p className="cv-page-sub">
        Excerpts from manufacturers, independent tests and owner reports. Anything we couldn’t
        find is marked as missing, never filled in.
      </p>
      {!ids.length ? (
        <p className="cv-empty-state">No independent evidence was found for these offers.</p>
      ) : !evidence ? (
        <p className="cv-empty-state" role="status">Loading source excerpts…</p>
      ) : (
        cards.map((card) => {
          const own = evidence.filter(
            (e) =>
              card.evidenceIds.includes(e.id) &&
              (!q || `${card.products[0].title} ${e.claim} ${e.excerpt}`.toLowerCase().includes(q)),
          );
          if (q && !own.length) return null;
          return (
            <div className="cv-group" key={card.offer.id}>
              <h2>
                {card.products[0].title}
                <small>
                  {card.merchant.displayName} · {price(card.totalCents)}
                </small>
              </h2>
              {own.length ? (
                <EvidenceStack items={own} />
              ) : (
                <p className="cv-empty">No independent evidence for this product.</p>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

type Orders = NonNullable<FunctionReturnType<typeof api.buyer.listOrders>>;

export function OrdersView({
  orders,
  onOpen,
}: {
  orders: Orders | undefined;
  onOpen: (requestId: string) => void;
}) {
  return (
    <section className="cv-page" aria-labelledby="cv-orders-title">
      <h1 id="cv-orders-title">Your orders</h1>
      <p className="cv-page-sub">Frozen receipts from demo orders. No payment was taken.</p>
      {!orders ? (
        <p className="cv-empty-state" role="status">Loading your orders…</p>
      ) : orders.length === 0 ? (
        <p className="cv-empty-state">No orders yet. Offers you approve will show up here.</p>
      ) : (
        <ul className="cv-orders">
          {orders.map((o, i) => (
            <li className="cv-card" key={o.orderId} style={at(i)}>
              <p className="cv-eyebrow plain">Ordered {fullDayLabel(o.createdAt)}</p>
              <h2>{money(o.quote.totalCents)} delivered</h2>
              <p>
                {o.products
                  .map((p: { title: string; quantity: number }) => `${p.quantity} × ${p.title}`)
                  .join(" + ")}
              </p>
              <p className="cv-footnote">Order {o.orderId}, arrives by {dayLabel(o.quote.arrivalAt)}</p>
              <button className="cv-secondary" onClick={() => onOpen(o.requestId)}>
                View request and receipt
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SavedView({
  saved,
  busy,
  onOpen,
  onRemove,
}: {
  saved: SavedOffer[] | undefined;
  busy: boolean;
  onOpen: (offer: SavedOffer) => void;
  onRemove: (offer: SavedOffer) => void;
}) {
  return (
    <section className="cv-page" aria-labelledby="cv-saved-title">
      <h1 id="cv-saved-title">Saved offers</h1>
      <p className="cv-page-sub">
        A saved offer is a snapshot. Open its original request for a fresh stock and price check.
      </p>
      {!saved ? (
        <p className="cv-empty-state" role="status">Loading saved offers…</p>
      ) : saved.length === 0 ? (
        <p className="cv-empty-state">Nothing saved yet. Tap the heart on an offer to keep it.</p>
      ) : (
        <div className="cv-grid">
          {saved.map((s, i) => {
            const product = s.card.products[0];
            const visual = productVisual(product.title, i);
            return (
              <article className="cv-offer" key={s.id} style={at(i)}>
                <div className="cv-offer-visual">
                  {visual ? (
                    <img src={visual.src} alt={visual.alt} className={photoClass(visual.src)} />
                  ) : (
                    <span className="cv-visual-fallback" aria-hidden="true">
                      {product.title.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="cv-offer-body">
                  <p className="cv-eyebrow">Saved from {s.card.merchant.displayName}</p>
                  <div className="cv-offer-title">
                    <h3>{product.title}</h3>
                    <p className="cv-price">
                      <strong>{price(s.card.totalCents)}</strong>
                    </p>
                  </div>
                  {s.card.mainConcern && <p className="cv-desc">{s.card.mainConcern}</p>}
                  <div className="cv-offer-actions">
                    <button className="cv-secondary" disabled={busy} onClick={() => onRemove(s)}>
                      Remove
                    </button>
                    <button className="cv-coral" onClick={() => onOpen(s)}>
                      View offer
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
