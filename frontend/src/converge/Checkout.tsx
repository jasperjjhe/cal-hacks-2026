import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { CheckIcon } from "./ui";
import { clock, dayLabel, money } from "./format";

export type Purchase = NonNullable<FunctionReturnType<typeof api.buyer.getPurchase>>;
type Quote = NonNullable<Purchase["quote"]>;
type Execution = NonNullable<Purchase["execution"]>;

const HOLD_SECONDS = 180;

function Field({ name, value }: { name: string; value: string }) {
  return (
    <label className="cv-field">
      <span>{name}</span>
      <input value={value} disabled readOnly />
    </label>
  );
}

function Tile({
  title,
  detail,
  selected,
  disabled,
  mark,
}: {
  title: string;
  detail: string;
  selected?: boolean;
  disabled?: boolean;
  mark?: string;
}) {
  return (
    <button
      type="button"
      className={`cv-tile ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
    >
      {mark && <img src={mark} alt="" width={41} height={35} />}
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function Outcome({
  execution,
  quote,
  onChooseAnother,
  onOrders,
  onNew,
}: {
  execution: Execution;
  quote: Quote;
  onChooseAnother: () => void;
  onOrders: () => void;
  onNew: () => void;
}) {
  const done = execution.status === "succeeded";
  const stripe = execution.status === "pending" && !!execution.checkoutUrl;
  return (
    <section
      className={`cv-outcome is-${execution.status}`}
      aria-live="polite"
      id="purchase-status"
    >
      <span className="cv-outcome-mark" aria-hidden="true">
        {done ? (
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path className="cv-draw" d="M20 6 9 17l-5-5" />
          </svg>
        ) : execution.status === "declined" ? (
          "!"
        ) : stripe ? (
          "→"
        ) : (
          <i className="cv-spinner" />
        )}
      </span>
      <h1>
        {done
          ? "Your order is placed"
          : execution.status === "declined"
            ? "That offer couldn’t be completed"
            : stripe
              ? "Finish paying on Stripe"
              : "Placing your order…"}
      </h1>
      <p>{execution.resultMessage}</p>
      {execution.orderId && (
        <p className="cv-footnote">
          Order {execution.orderId}: {money(quote.totalCents)} delivered, arrives by{" "}
          {dayLabel(quote.arrivalAt)}
        </p>
      )}
      {stripe && (
        <p className="cv-footnote">
          Use a Stripe test card. Your stock stays held while you pay.
        </p>
      )}
      {(execution.status === "pending" || execution.status === "unknown") && !stripe && (
        <p className="cv-footnote">
          Your stock stays locked while this same attempt is resolved. You can leave and come
          back to this request.
        </p>
      )}
      <div className="cv-ended-actions">
        {stripe ? (
          <a className="cv-primary" href={execution.checkoutUrl ?? undefined}>
            Continue to Stripe payment
          </a>
        ) : done ? (
          <>
            <button className="cv-secondary" onClick={onNew}>
              Start another request
            </button>
            <button className="cv-primary" onClick={onOrders}>
              View your orders
            </button>
          </>
        ) : execution.status === "declined" ? (
          <button className="cv-primary" onClick={onChooseAnother}>
            Choose another offer
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function Checkout({
  purchase,
  busy,
  onBack,
  onApprove,
  onRenew,
  onChooseAnother,
  onOrders,
  onNew,
}: {
  purchase: Purchase;
  busy: boolean;
  onBack: () => void;
  onApprove: () => void;
  onRenew: () => void;
  onChooseAnother: () => void;
  onOrders: () => void;
  onNew: () => void;
}) {
  const quote = purchase.quote!;
  const [now, setNow] = useState(Date.now);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (purchase.execution)
    return (
      <div className="cv-checkout is-solo">
        <Outcome
          execution={purchase.execution}
          quote={quote}
          onChooseAnother={onChooseAnother}
          onOrders={onOrders}
          onNew={onNew}
        />
      </div>
    );

  const remaining = Math.max(0, Math.ceil((quote.expiresAt - now) / 1000));
  const expired = remaining === 0 || purchase.quoteState === "expired";
  const names = quote.lines.map(
    (l) =>
      purchase.products.find(
        (p: { requestLineId: string; title: string }) => p.requestLineId === l.requestLineId,
      )?.title ?? l.listing.id,
  );
  const items = quote.lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  // copy follows the quote's payment mode so it never claims "simulated" when it isn't
  const simulated = quote.paymentMode === "simulation";

  return (
    <div className="cv-checkout">
      <h1>Complete your purchase</h1>
      <div className="cv-checkout-grid">
        <section className="cv-panel" aria-label="Delivery and payment">
          <h2>Shipping address</h2>
          <p className="cv-footnote">
            Demo delivery: San Francisco only. This demo doesn’t collect or store a street
            address.
          </p>
          <div className="cv-fields-stack">
            <Field name="Country / region" value="United States · San Francisco" />
            <Field name="Street address" value="Not collected in the demo" />
            <div className="cv-fields-pair">
              <Field name="City" value="San Francisco" />
              <Field name="Postal code" value="—" />
            </div>
          </div>

          <h2>Delivery options</h2>
          <div className="cv-tiles">
            <Tile
              title="Standard delivery"
              detail={`Arrives ${dayLabel(quote.arrivalAt)} · ${money(quote.shippingCents)}`}
              selected
            />
            <Tile
              title="Express delivery"
              detail="Not offered by this merchant"
              disabled
            />
          </div>

          <h2>Payment options</h2>
          <div className="cv-tiles">
            <Tile
              title="Credit / debit card"
              detail={
                simulated
                  ? "Simulated checkout · no payment is taken"
                  : "Secure payment on Stripe · test mode, no real money"
              }
              selected
            />
            <Tile
              title="Coinbase crypto"
              detail="Coming soon"
              disabled
              mark="/converge/brand/coinbase.png"
            />
          </div>
        </section>

        <aside className="cv-panel cv-summary" aria-label="Order summary">
          <div>
            <h2>Order Summary</h2>
            <p className="cv-summary-items">{names.join(" · ")}</p>
            <dl className="cv-sum is-spaced">
              <div>
                <dt>Item{quote.lines.length > 1 ? "s" : ""}</dt>
                <dd>{money(items)}</dd>
              </div>
              <div>
                <dt>Shipping · Standard</dt>
                <dd>{money(quote.shippingCents)}</dd>
              </div>
              <div>
                <dt>Estimated tax</dt>
                <dd>
                  {money(quote.taxCents)}
                  <small>included in demo price</small>
                </dd>
              </div>
              <div className="is-total">
                <dt>Total</dt>
                <dd>{money(quote.totalCents)}</dd>
              </div>
            </dl>
          </div>

          <div className="cv-hold" role="timer" aria-live="off">
            <p>
              <strong>{expired ? "Price hold ended" : "Price held for you"}</strong>
              <span>{expired ? "0:00" : clock(remaining)}</span>
            </p>
            <div className="cv-hold-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${remaining / HOLD_SECONDS})` }} />
            </div>
          </div>

          <dl className="cv-sum">
            <div>
              <dt>Expected arrival</dt>
              <dd>{dayLabel(quote.arrivalAt)}</dd>
            </div>
            <div>
              <dt>Warranty and returns</dt>
              <dd>
                {quote.warrantyMonths} months, {quote.returnDays}-day returns
              </dd>
            </div>
          </dl>

          {expired ? (
            <div className="cv-expired" role="status">
              <p>
                The hold on this stock ended. Re-check to renew the price and review the terms
                again.
              </p>
              <div className="cv-summary-actions">
                <button className="cv-secondary" onClick={onBack}>
                  Back to quote
                </button>
                <button className="cv-sunset" disabled={busy} onClick={onRenew}>
                  {busy ? "Checking…" : "Re-check price"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="cv-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I approve this exact item, quantity, delivered total and terms
                  {simulated ? " for a simulated order." : " for this Stripe test purchase."}
                </span>
              </label>
              <div className="cv-summary-actions">
                <button className="cv-secondary" onClick={onBack}>
                  Back to quote
                </button>
                <button
                  className="cv-sunset"
                  disabled={busy || !consent}
                  onClick={onApprove}
                >
                  {busy ? (
                    "Placing order…"
                  ) : simulated ? (
                    <>
                      <CheckIcon size={14} /> Place demo order
                    </>
                  ) : (
                    "Pay now"
                  )}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
