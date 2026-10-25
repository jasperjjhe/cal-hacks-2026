import { useState } from "react";
import type { CSSProperties } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { OfferCard } from "../contracts";
import { Chip, PromptBox } from "./ui";
import { fullDayLabel, price } from "./format";
import { photoClass, productVisual } from "./visuals";

type Request = FunctionReturnType<typeof api.buyer.listRequests>[number];
export type SavedOffer = FunctionReturnType<typeof api.buyer.listSaved>[number];

const starters = [
  {
    label: "Headphones",
    text: "I'm looking for a new pair of black noise-cancelling headphones. Budget is $450.",
  },
  {
    label: "Laptops",
    text: "I need a laptop for Figma, school, and some video editing. My budget is $1,000.",
  },
  {
    label: "Clothing",
    text: "I need a navy cotton tee, size M, under $40.",
  },
  {
    label: "Home & kitchen",
    text: "I need a 1.5 litre kettle with a US plug, under $60.",
  },
];

const steps = [
  ["Describe it", "Tell your buyer agent what matters. You confirm the brief before anything starts."],
  ["Sellers compete", "Merchant agents answer with checked offers. Your maximum stays private."],
  ["You decide", "Compare the evidence, then approve exact terms. Nothing is bought without you."],
];

export type Suggested = { requestId: string; runId: string; cards: OfferCard[] };

function MiniOffer({ card, index, onOpen }: { card: OfferCard; index: number; onOpen: () => void }) {
  const product = card.products[0];
  const visual = productVisual(product.title, index);
  return (
    <button className="cv-mini" onClick={onOpen} style={{ "--i": index } as CSSProperties}>
      <span className="cv-mini-visual">
        {visual ? (
          <img src={visual.src} alt={visual.alt} className={photoClass(visual.src)} />
        ) : (
          <span className="cv-mini-placeholder" aria-hidden="true">
            {product.title.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="cv-mini-row">
        <strong>{product.title}</strong>
        <span>{price(card.totalCents)}</span>
      </span>
    </button>
  );
}

export function Home({
  greeting,
  message,
  onMessage,
  onSubmit,
  busy,
  requests,
  saved,
  suggested,
  onOpenRequest,
  onOpenSaved,
  onOpenSuggested,
}: {
  greeting: string;
  message: string;
  onMessage: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  requests: Request[] | undefined;
  saved: SavedOffer[] | undefined;
  /** the latest run's offers, shown as the "Suggested offers" strip */
  suggested: Suggested | null;
  onOpenRequest: (id: string) => void;
  onOpenSaved: (offer: SavedOffer) => void;
  onOpenSuggested: (card: OfferCard, index: number, from: Suggested) => void;
}) {
  const [engaged, setEngaged] = useState(false);
  const showStarters = engaged || message.length > 0;
  const hasHistory = !!requests?.length || !!saved?.length || !!suggested;

  return (
    <div className="cv-home">
      <section className="cv-hero">
        <h1>
          {greeting}{" "}
          <img src="/converge/brand/logo.svg" alt="" width={30} height={28} />
          <br />
          What would you like to converge today?
        </h1>
        <div
          className="cv-hero-input"
          onFocusCapture={() => setEngaged(true)}
          onBlurCapture={(e) => {
            // focus moving to a chip must not close the row before the click lands
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
          }}
        >
          <PromptBox
            value={message}
            onChange={onMessage}
            onSubmit={onSubmit}
            busy={busy}
            placeholder="I need a laptop for Figma, school, and some video editing…"
            label="Describe what you need"
            autoFocus
          />
          <div
            className={`cv-starters ${showStarters ? "is-open" : ""}`}
            aria-hidden={!showStarters}
            // keep the textarea focused while a chip is pressed (Safari doesn't focus buttons)
            onMouseDown={(e) => e.preventDefault()}
          >
            {starters.map((s) => (
              <Chip key={s.label} onClick={() => onMessage(s.text)} disabled={!showStarters}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <p className="cv-hero-note">
          Demo merchants with fictional inventory. Delivery to San Francisco, prices in USD.
        </p>
      </section>

      {hasHistory ? (
        <section className="cv-strip" aria-label="Pick up where you left off">
          {!!suggested && (
            <>
              <h2>Suggested offers from merchant agents</h2>
              <div className="cv-strip-card">
                <div className="cv-strip-grid">
                  {suggested.cards.slice(0, 3).map((card, i) => (
                    <MiniOffer
                      key={card.offer.id}
                      card={card}
                      index={i}
                      onOpen={() => onOpenSuggested(card, i, suggested)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {!!saved?.length && (
            <>
              <h2>Your saved offers</h2>
              <div className="cv-strip-card">
                <div className="cv-strip-grid">
                  {saved.slice(0, 3).map((s, i) => (
                    <MiniOffer key={s.id} card={s.card} index={i} onOpen={() => onOpenSaved(s)} />
                  ))}
                </div>
              </div>
            </>
          )}
          {!!requests?.length && (
            <>
              <h2>Pick up where you left off</h2>
              <ul className="cv-recent">
                {requests.slice(0, 4).map((r, i) => (
                  <li key={r.requestId} style={{ "--i": i } as CSSProperties}>
                    <button onClick={() => onOpenRequest(r.requestId)}>
                      <strong>{r.title}</strong>
                      <span>
                        {fullDayLabel(r.updatedAt)}
                        <b>{r.activeRunId ? "View offers" : "Review brief"}</b>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="cv-how" aria-label="How Converge works">
          {steps.map(([title, body], i) => (
            <div key={title} style={{ "--i": i } as CSSProperties}>
              <span className="cv-how-n" aria-hidden="true">
                {i + 1}
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
