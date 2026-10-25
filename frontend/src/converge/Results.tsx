import type { CSSProperties } from "react";
import type { Contract, OfferCard } from "../contracts";
import {
  ArrowUpRight,
  CheckIcon,
  Chip,
  CrossIcon,
  HeartIcon,
  PlusIcon,
} from "./ui";
import { dayLabel, label as pretty, price } from "./format";
import { actualText, evidenceLine, fitLine, matches, noProsCopy, prosAndCons } from "./labels";
import type { Point } from "./labels";
import { loaderPhotos, photoClass, productVisual } from "./visuals";

type Run = Contract<"BuyerRunView">;
type Sort = Contract<"RequestVersion">["sort"];
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/* ---------- loading: the converging fan ---------- */
const stageCopy: Record<Run["stage"], string> = {
  bidding: "Merchants are reading your brief",
  council: "Merchants are making their case",
  negotiating: "Merchants are sharpening their prices",
  researching: "Checking independent evidence",
  results: "Offers are ready",
  no_match: "No offer met every requirement",
  cancelled: "This run was cancelled",
  failed: "The run could not finish",
};

export function Converging({
  run,
  showLog,
  onToggleLog,
}: {
  run: Run | null | undefined;
  showLog: boolean;
  onToggleLog: () => void;
}) {
  return (
    <section className="cv-converging" aria-label="Finding your offers">
      <div className="cv-fan" aria-hidden="true">
        {loaderPhotos.map((src, i) => (
          <span key={src} className={`cv-fan-card c${i + 1}`}>
            <img src={src} alt="" />
          </span>
        ))}
      </div>
      <div className="cv-converging-copy" role="status" aria-live="polite">
        <p className="cv-converging-title">Converging your options…</p>
        <p className="cv-converging-sub">
          {run
            ? `${stageCopy[run.stage]} · ${run.completedMerchantCount} of ${run.participatingMerchantCount} merchants responded`
            : "Starting your comparison"}
        </p>
        {run && run.finalStatus.invited > 0 && (
          <p className="cv-converging-sub">
            {run.finalStatus.received}/{run.finalStatus.invited} final decisions in
            {run.finalStatus.received < run.finalStatus.invited &&
              ". Prices stay sealed until the round closes"}
            .
          </p>
        )}
      </div>
      <div className="cv-toolbar">
        <Chip onClick={onToggleLog} pressed={showLog}>
          {showLog ? "Hide reasoning" : "Explain reasoning"}
        </Chip>
      </div>
      {showLog && run && (
        <ol className="cv-log" aria-label="What your merchants have done so far">
          {run.events.length === 0 && <li>Nothing has happened yet.</li>}
          {run.events.map((event) => (
            <li key={event.id}>
              <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
              <span>{event.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function EndedState({
  run,
  busy,
  onRevise,
  onRetry,
}: {
  run: Run;
  busy: boolean;
  onRevise: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="cv-ended">
      <h1>{stageCopy[run.stage]}</h1>
      <p>
        {run.error?.message ??
          (run.stage === "no_match"
            ? "No merchant could meet every must-have within your limits. Loosen a requirement or your price, and I’ll look again."
            : "Nothing was bought. You can change your brief or run it again.")}
      </p>
      <div className="cv-ended-actions">
        <button className="cv-secondary" disabled={busy} onClick={onRevise}>
          Change requirements
        </button>
        <button className="cv-primary" disabled={busy} onClick={onRetry}>
          Run it again
        </button>
      </div>
    </section>
  );
}

/* ---------- pros and cons ---------- */
export function PointList({ points, kind }: { points: Point[]; kind: "pro" | "con" }) {
  return (
    <ul className={`cv-points is-${kind}`}>
      {points.map((p) => (
        <li key={p.key}>
          <span className="cv-point-icon" aria-hidden="true">
            {kind === "pro" ? <PlusIcon size={16} /> : <CrossIcon size={16} />}
          </span>
          <span>
            <strong>{p.title}</strong> — {p.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProsConsBlock({
  card,
  labels,
}: {
  card: OfferCard;
  labels: Map<string, string>;
}) {
  const { pros, cons } = prosAndCons(card, labels);
  return (
    <div className="cv-proscons">
      <h4 className="is-pro">Pros</h4>
      {pros.length ? (
        <PointList points={pros} kind="pro" />
      ) : (
        <p className="cv-empty">{noProsCopy(card)}</p>
      )}
      <h4 className="is-con">Cons</h4>
      {cons.length ? (
        <PointList points={cons} kind="con" />
      ) : (
        <p className="cv-empty">No concerns were flagged.</p>
      )}
    </div>
  );
}

/* ---------- offers ---------- */
function Offer({
  card,
  index,
  compared,
  saved,
  locked,
  proscons,
  labels,
  onCompare,
  onView,
  onSave,
}: {
  card: OfferCard;
  index: number;
  compared: boolean;
  saved: boolean;
  locked: boolean;
  proscons: boolean;
  labels: Map<string, string>;
  onCompare: () => void;
  onView: () => void;
  onSave: () => void;
}) {
  const first = card.products[0];
  const extra = card.products.length - 1;
  const visual = productVisual(first.title, index);
  const dropped = card.initialTotalCents > card.totalCents;
  // server-computed, only when offers can be fairly compared (see convex/buyer/highlights.ts)
  const highlights = card.highlights ?? [];
  return (
    <article
      className={`cv-offer ${compared ? "is-compared" : ""}`}
      style={at(index)}
    >
      <div className="cv-offer-visual">
        {visual ? (
          <img src={visual.src} alt={visual.alt} className={photoClass(visual.src)} />
        ) : (
          <span className="cv-visual-fallback" aria-hidden="true">
            {first.title.slice(0, 1)}
          </span>
        )}
        <button
          className="cv-heart"
          aria-pressed={saved}
          disabled={locked}
          aria-label={`${saved ? "Remove" : "Save"} ${first.title}`}
          onClick={onSave}
        >
          <HeartIcon size={18} filled={saved} />
        </button>
      </div>
      <div className="cv-offer-body">
        <p className="cv-eyebrow">
          {highlights.length
            ? highlights.join(" · ")
            : `${card.merchant.displayName}, ${first.condition}`}
        </p>
        <div className="cv-offer-title">
          <h3>
            {first.title}
            {extra > 0 && <small> + {extra} more</small>}
          </h3>
          <p className="cv-price">
            {dropped && (
              <s>
                <span className="cv-sr">Opening price </span>
                {price(card.initialTotalCents)}
              </s>
            )}
            <strong>
              <span className="cv-sr">Delivered total </span>
              {price(card.totalCents)}
            </strong>
          </p>
        </div>
        {highlights.length > 0 && (
          <p className="cv-merchant">
            {card.merchant.displayName}, <span className="cv-cap">{first.condition}</span>
          </p>
        )}
        <ul className="cv-tags" aria-label="Offer terms">
          <li
            className={`is-fit ${card.fit.coveragePercent === null ? "" : "is-scored"}`}
          >
            {fitLine(card)}
          </li>
          <li>By {dayLabel(card.arrivalAt)}</li>
          <li>{card.warrantyMonths} mo warranty</li>
          <li>{card.returnDays}-day returns</li>
        </ul>
        <p className="cv-desc">{card.fitArgument}</p>
        <p className="cv-sources">
          <ArrowUpRight size={12} /> {evidenceLine(card)}
        </p>
        {proscons && <ProsConsBlock card={card} labels={labels} />}
        {card.unavailableReason && (
          <p className="cv-unavailable">{card.unavailableReason}</p>
        )}
        <div className="cv-offer-actions">
          <button
            className="cv-secondary"
            aria-pressed={compared}
            onClick={onCompare}
          >
            {compared ? "Comparing" : "Compare"}
          </button>
          <button className="cv-coral" onClick={onView}>
            View offer
          </button>
        </div>
      </div>
    </article>
  );
}

const sorts: [Sort, string][] = [
  ["best_fit", "Best fit"],
  ["cheapest", "Lowest price"],
  ["soonest", "Soonest"],
  ["warranty", "Longest warranty"],
];

export function Offers({
  cards,
  query,
  sort,
  onSort,
  comparedIds,
  savedIds,
  locked,
  proscons,
  labels,
  onCompare,
  onView,
  onSave,
}: {
  cards: OfferCard[];
  query: string;
  sort: Sort;
  onSort: (sort: Sort) => void;
  comparedIds: string[];
  savedIds: Set<string>;
  locked: boolean;
  proscons: boolean;
  labels: Map<string, string>;
  onCompare: (card: OfferCard) => void;
  onView: (card: OfferCard) => void;
  onSave: (card: OfferCard) => void;
}) {
  const shown = cards.filter((c) => matches(c, query));
  return (
    <section className="cv-offers" aria-label="Your top matches">
      <div className="cv-offers-head">
        <h1>Your top matches</h1>
        <div className="cv-sorts" role="group" aria-label="Order offers by">
          {sorts.map(([id, name]) => (
            <button
              key={id}
              aria-pressed={sort === id}
              disabled={locked}
              onClick={() => onSort(id)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="cv-empty-state">
          No offers match “{query}”. Clear the search to see all {cards.length}.
        </p>
      ) : (
        <div className="cv-grid">
          {shown.map((card, i) => (
            <Offer
              key={`${card.offer.id}:${card.offer.version}`}
              card={card}
              index={i}
              compared={comparedIds.includes(card.offer.id)}
              saved={savedIds.has(card.offer.id)}
              locked={locked}
              proscons={proscons}
              labels={labels}
              onCompare={() => onCompare(card)}
              onView={() => onView(card)}
              onSave={() => onSave(card)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- direct comparison ---------- */
const statusIcon = {
  matched: <CheckIcon size={14} />,
  unmet: <CrossIcon size={14} />,
  unknown: <span aria-hidden="true">?</span>,
} as const;
const statusWord = { matched: "Matches", unmet: "Doesn’t match", unknown: "Not confirmed" };

export function CompareTable({
  cards,
  labels,
}: {
  cards: OfferCard[];
  labels: Map<string, string>;
}) {
  const requirementIds = [
    ...new Set(cards.flatMap((c) => c.fit.checks.map((x) => x.requirementId))),
  ];
  const rows: [string, (c: OfferCard) => string][] = [
    ["Delivered total", (c) => price(c.totalCents)],
    ["Arrives by", (c) => dayLabel(c.arrivalAt)],
    ["Warranty", (c) => `${c.warrantyMonths} months`],
    ["Returns", (c) => `${c.returnDays} days`],
    ["Preference fit", fitLine],
    ["Evidence", (c) => evidenceLine(c)],
    ["Main concern", (c) => c.mainConcern ?? "None flagged"],
  ];
  return (
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="cv-sr">Check</span>
            </th>
            {cards.map((c) => (
              <th scope="col" key={c.offer.id}>
                <strong>{c.products[0].title}</strong>
                <span>{c.merchant.displayName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, read]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              {cards.map((c) => (
                <td key={c.offer.id}>{read(c)}</td>
              ))}
            </tr>
          ))}
          {requirementIds.map((id) => (
            <tr key={id}>
              <th scope="row">{labels.get(id) ?? pretty(id)}</th>
              {cards.map((c) => {
                const check = c.fit.checks.find((x) => x.requirementId === id);
                return (
                  <td key={c.offer.id}>
                    {check ? (
                      <span className={`cv-status is-${check.status}`}>
                        <i>{statusIcon[check.status]}</i>
                        <span>
                          <span className="cv-sr">{statusWord[check.status]}: </span>
                          {actualText(check.actual)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
