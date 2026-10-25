import { useState } from "react";
import type { OfferCard } from "../contracts";
import { ArrowLeft, CheckIcon, ChevronLeft, ChevronRight, CrossIcon } from "./ui";
import { dayLabel, label as pretty, price } from "./format";
import { actualText, fitLine, noProsCopy, prosAndCons } from "./labels";
import { PointList } from "./Results";
import { EvidenceList } from "./Pages";
import { galleryFor, photoClass } from "./visuals";

function Gallery({ title, index }: { title: string; index: number }) {
  const images = galleryFor(title, index);
  const [at, setAt] = useState(0);
  if (!images.length)
    return (
      <div className="cv-gallery is-empty">
        <span aria-hidden="true">{title.slice(0, 1)}</span>
        <p>No photo is available for this listing.</p>
      </div>
    );
  const go = (step: number) =>
    setAt((current) => (current + step + images.length) % images.length);
  return (
    <div
      className="cv-gallery"
      role="group"
      aria-roledescription="carousel"
      aria-label={`${title} photos`}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === at ? `${title} — illustrative photo ${i + 1} of ${images.length}` : ""}
          aria-hidden={i !== at}
          className={[i === at && "is-current", photoClass(src)].filter(Boolean).join(" ")}
        />
      ))}
      {images.length > 1 && (
        <div className="cv-gallery-controls">
          <button aria-label="Previous photo" onClick={() => go(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="cv-dots" aria-hidden="true">
            {images.map((src, i) => (
              <i key={src} className={i === at ? "is-current" : ""} />
            ))}
          </span>
          <button aria-label="Next photo" onClick={() => go(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <p className="cv-gallery-note">Illustrative photo, not the exact unit.</p>
    </div>
  );
}

export function Product({
  card,
  index,
  requestId,
  runId,
  labels,
  busy,
  locked,
  paymentMode,
  onBack,
  onBuy,
}: {
  card: OfferCard;
  index: number;
  requestId: string | null;
  runId: string | null;
  labels: Map<string, string>;
  busy: boolean;
  locked: boolean;
  paymentMode: "simulation" | "visa_sandbox" | "stripe_test" | undefined;
  onBack: () => void;
  onBuy: () => void;
}) {
  const first = card.products[0];
  const { pros, cons } = prosAndCons(card, labels);
  const dropped = card.initialTotalCents > card.totalCents;
  const confirmedCount = card.fit.checks.filter((c) => c.status === "matched").length;

  return (
    <div className="cv-product">
      <div className="cv-product-main">
        <button className="cv-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to offers
        </button>
        <header className="cv-product-head">
          <div>
            <p className="cv-eyebrow plain">
              {card.merchant.displayName} · fictional merchant
            </p>
            <h1>
              {first.title}
              {card.products.length > 1 && (
                <small> + {card.products.length - 1} more</small>
              )}
            </h1>
            {!!card.highlights?.length && (
              <ul className="cv-highlights" aria-label="Why this offer stands out">
                {card.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </div>
          <ul className="cv-facts" aria-label="Offer terms">
            <li>{first.condition}</li>
            <li>{card.warrantyMonths} mo warranty</li>
            <li>{card.returnDays}-day returns</li>
          </ul>
        </header>
        <p className="cv-product-price">
          <strong>{price(card.totalCents)}</strong>
          <span>
            delivered to San Francisco · USD · demo tax $0
            {dropped && ` · was ${price(card.initialTotalCents)}`}
          </span>
        </p>

        <Gallery title={first.title} index={index} />

        <section className="cv-card" aria-labelledby="cv-p-details">
          <h2 id="cv-p-details">What you asked for</h2>
          <div className="cv-cells">
            {card.fit.checks.map((check) => (
              <div className={`cv-cell is-${check.status}`} key={check.requirementId}>
                <span>{labels.get(check.requirementId) ?? "Requirement"}</span>
                <strong>
                  <i aria-hidden="true">
                    {check.status === "matched" ? (
                      <CheckIcon size={13} />
                    ) : check.status === "unmet" ? (
                      <CrossIcon size={13} />
                    ) : (
                      "?"
                    )}
                  </i>
                  {actualText(check.actual)}
                </strong>
              </div>
            ))}
            <div className="cv-cell">
              <span>Condition</span>
              <strong>{pretty(first.condition)}</strong>
            </div>
            <div className="cv-cell">
              <span>Arrives by</span>
              <strong>{dayLabel(card.arrivalAt)}</strong>
            </div>
            <div className="cv-cell">
              <span>Offer valid until</span>
              <strong>{new Date(card.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
            </div>
          </div>
        </section>

        <section className="cv-card" aria-labelledby="cv-p-why">
          <h2 id="cv-p-why">Why this offer</h2>
          <p className="cv-body-large">{card.fitArgument}</p>
        </section>

        <section className="cv-card" aria-labelledby="cv-p-reviews">
          <h2 id="cv-p-reviews">Reviews &amp; independent evidence</h2>
          {requestId ? (
            <EvidenceList requestId={requestId} runId={runId ?? undefined} ids={card.evidenceIds} />
          ) : (
            <p className="cv-empty">
              Source excerpts aren’t available for this older saved snapshot.
            </p>
          )}
        </section>

        <section className="cv-card cv-proscons-card" aria-labelledby="cv-p-pc">
          <h2 id="cv-p-pc" className="cv-sr">
            Pros and cons
          </h2>
          <div className="cv-pc-cols">
            <div className="cv-proscons">
              <h3 className="is-pro">Pros</h3>
              {pros.length ? (
                <PointList points={pros} kind="pro" />
              ) : (
                <p className="cv-empty">{noProsCopy(card)}</p>
              )}
            </div>
            <div className="cv-proscons">
              <h3 className="is-con">Cons</h3>
              {cons.length ? (
                <PointList points={cons} kind="con" />
              ) : (
                <p className="cv-empty">No concerns were flagged.</p>
              )}
            </div>
          </div>
          <p className="cv-footnote">
            {pros.length} of {pros.length + cons.length} checks confirmed by the seller’s listing
            {card.evidenceStatus === "unavailable" ? "; no independent sources were found." : "."}
          </p>
        </section>
      </div>

      <aside className="cv-product-side" aria-label="Review and check out">
        <section>
          <h2>How it fits your brief</h2>
          <p className="cv-fit-number">
            <strong>{confirmedCount}</strong> of {card.fit.checks.length} requirements confirmed
          </p>
          <p className="cv-fit-sub">
            {fitLine(card)} · hard requirements {card.fit.hardRequirementsPass ? "pass" : "don’t all pass"}
          </p>
        </section>
        <section>
          <h2>Review and check out</h2>
          <dl className="cv-sum">
            <div>
              <dt>Item</dt>
              <dd>{card.products.map((p) => `${p.quantity} × ${p.title}`).join(", ")}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{dayLabel(card.arrivalAt)}</dd>
            </div>
            <div>
              <dt>Returns</dt>
              <dd>{card.returnDays} days</dd>
            </div>
            <div>
              <dt>Warranty</dt>
              <dd>{card.warrantyMonths} months</dd>
            </div>
          </dl>
          <div className="cv-total">
            <span>Delivered total</span>
            <strong>{price(card.totalCents)}</strong>
          </div>
          <button
            className="cv-sunset wide"
            disabled={busy || locked || !card.selectable}
            onClick={onBuy}
          >
            {busy ? "Checking stock…" : "Buy now"}
          </button>
          <p className="cv-footnote">
            {card.unavailableReason ??
              (paymentMode === "stripe_test"
                ? "Stock, price and your limit are rechecked when you continue. You’ll pay with a Stripe test card; no real money is charged."
                : "Stock, price and your limit are rechecked when you continue. Demo checkout — no payment is taken.")}
          </p>
        </section>
      </aside>
    </div>
  );
}
