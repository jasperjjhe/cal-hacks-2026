import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  approve,
  beginRun,
  deliveryDate,
  dateOnlyLabel,
  journeyStage,
  navigate,
  noMatchReason,
  reviseDraft,
  tickRun,
  catalog,
  categories,
  confirmationError,
  dateInput,
  dateLabel,
  initialState,
  matchingOffers,
  money,
  reserve,
  restoreState,
  sendMessage,
} from "./buyer/mock.ts";
import type { MockOffer, MockState } from "./buyer/mock.ts";
import "./App.css";

const storageKey = "buyerunion.mock.v1";
const example =
  "I need a laptop for Figma, school, and some video editing. My budget is $1,000, delivered to San Francisco. I’m open to refurbished.";
const examples = [
  example,
  "I need a navy cotton tee, size M, under $40.",
  "I need a small shelf under $100.",
  "I need a 1.5 litre kettle with a US plug, under $60.",
];
const stepNames = ["Describe", "Check offers", "Compare", "Approve"];
const progressMessages = [
  [
    "Merchant A",
    "A matching sample configuration is available. Its proposed price stays within the demo policy.",
  ],
  [
    "Merchant B",
    "An authorized price revision is ready. Delivery and warranty terms are unchanged.",
  ],
  [
    "BuyerUnion",
    "Comparing final sample offers. Owner evidence is unavailable; no reviews have been invented.",
  ],
];
function load() {
  try {
    return restoreState(localStorage.getItem(storageKey));
  } catch {
    return initialState();
  }
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ProductCard({
  offer,
  saved,
  compared,
  save,
  compare,
  view,
  preview = false,
}: {
  offer: MockOffer;
  saved: boolean;
  compared: boolean;
  save: () => void;
  compare: () => void;
  view: () => void;
  preview?: boolean;
}) {
  return (
    <article className={`offer-card ${compared ? "is-compared" : ""}`}>
      <div className="product-visual">
        {offer.image ? (
          <img
            src={offer.image}
            alt="Illustrative laptop workspace; not an exact product photograph"
          />
        ) : (
          <div className="category-visual">
            <span>
              {offer.category === "clothing"
                ? "M"
                : offer.category === "small_appliance"
                  ? "1.5 L"
                  : "500 mm"}
            </span>
            {categories[offer.category]}
          </div>
        )}
        <span className="condition-pill">
          {offer.condition === "new" ? "New" : "Refurbished"}
        </span>
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          onClick={save}
          aria-label={`${saved ? "Unsave" : "Save"} ${offer.title} from ${offer.merchant}`}
          aria-pressed={saved}
        >
          {saved ? "◆" : "◇"}
        </button>
      </div>
      <div className="offer-body">
        <span className="merchant-name">{offer.merchant}</span>
        <div className="product-title">
          <h3>{offer.title}</h3>
          <strong>{money(offer.total)}</strong>
        </div>
        <div className="price-caption">
          {preview ? (
            "Illustrative delivered price"
          ) : (
            <>
              {offer.initial !== offer.total ? (
                <>
                  <s>{money(offer.initial)}</s> ·{" "}
                  {money(offer.initial - offer.total)} demo improvement
                </>
              ) : (
                "Price held · no concession"
              )}
            </>
          )}
        </div>
        <div className="specs">
          {offer.specs.map((spec) => (
            <span key={spec}>{spec}</span>
          ))}
        </div>
        <p className="offer-terms">
          {offer.days} day{offer.days === 1 ? "" : "s"} delivery ·{" "}
          {offer.warranty}-month warranty · {offer.returns}-day returns
        </p>
        <div className="offer-copy">
          <span className="eyebrow">AGENT TAKE · SCRIPTED</span>
          <p>{offer.take}</p>
        </div>
        <div className="tradeoff">
          <span className="eyebrow">TRADE-OFF</span>
          <p>{offer.concern}</p>
        </div>
        <p className="evidence-link">↗ Owner evidence unavailable</p>
        <div className="card-actions">
          <button
            className="secondary"
            aria-pressed={compared}
            onClick={compare}
          >
            {compared ? "✓ Selected" : "Compare"}
          </button>
          <button className="primary" onClick={view}>
            {preview ? "Explore offer" : "View offer"}
          </button>
        </div>
      </div>
    </article>
  );
}
export default function App() {
  const [state, setState] = useState<MockState>(load);
  const [input, setInput] = useState("");
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const [sort, setSort] = useState("best_fit");
  const heading = useRef<HTMLHeadingElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const page = state.page;
  const stage = journeyStage(state);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Browser storage may be disabled; the current session remains usable. */
    }
  }, [state]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    if (messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [state.messages.length, page]);
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        const time = Date.now();
        setNow(time);
        setState((current) => tickRun(current, time));
      },
      stage === "progress" || page === "approval" ? 500 : 30000,
    );
    return () => window.clearInterval(timer);
  }, [stage, page]);
  const edit = (patch: Parameters<typeof reviseDraft>[1]) => {
    setError("");
    setCompared([]);
    setState((current) => reviseDraft(current, patch));
  };
  const go = (next: MockState["page"]) => {
    setError("");
    setCompared([]);
    setNow(Date.now());
    setState((current) => navigate(current, next, Date.now()));
  };
  const send = (text: string) => {
    setError("");
    setState((current) =>
      sendMessage(
        current.page === "home"
          ? {
              ...initialState(),
              saved: current.saved,
              orders: current.orders,
              version: current.version,
            }
          : current,
        text,
      ),
    );
    setInput("");
    setCompared([]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };
  const save = (id: string) =>
    setState((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((saved) => saved !== id)
        : [...current.saved, id],
    }));
  const toggleCompare = (id: string) =>
    setCompared((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id].slice(-3),
    );
  const start = (event: FormEvent) => {
    event.preventDefault();
    const issue = confirmationError(state);
    if (issue) {
      setError(issue);
      return;
    }
    setCompared([]);
    setError("");
    setReview(false);
    setNow(Date.now());
    setState((current) => beginRun(current, Date.now()));
  };
  const select = (id: string) => {
    try {
      setState(reserve(state, id, Date.now()));
      setDetail(null);
      setCompareOpen(false);
      setError("");
      setNow(Date.now());
    } catch (issue) {
      setError((issue as Error).message);
    }
  };
  const finish = () => {
    try {
      setState(approve(state, Date.now()));
      setError("");
    } catch (issue) {
      setError((issue as Error).message);
    }
  };
  const elapsed =
    state.runStartedAt === null ? 0 : Math.max(0, now - state.runStartedAt);
  const progress = Math.min(3, Math.floor(elapsed / 1800));
  const offers = matchingOffers(state, now).sort((a, b) =>
    sort === "soonest"
      ? a.days - b.days || a.total - b.total
      : sort === "warranty"
        ? b.warranty - a.warranty || a.total - b.total
        : a.total - b.total ||
          a.days - b.days ||
          b.warranty - a.warranty ||
          (a.id < b.id ? -1 : 1),
  );
  const selected = state.quote?.offerSnapshot;
  const detailOffer = catalog.find((offer) => offer.id === detail);
  const currentStep =
    page === "progress"
      ? 1
      : page === "results"
        ? 2
        : page === "approval" || page === "receipt"
          ? 3
          : 0;
  const cards =
    page === "saved"
      ? catalog.filter((offer) => state.saved.includes(offer.id))
      : page === "home"
        ? catalog.filter((offer) => offer.category === "laptop")
        : offers;
  const timeLeft = Math.max(
    0,
    Math.ceil(((state.quote?.expiresAt ?? now) - now) / 1000),
  );
  const isJourney = [
    "chat",
    "progress",
    "results",
    "approval",
    "receipt",
  ].includes(page);
  const newRequest = () => {
    setError("");
    setCompared([]);
    setState((current) => ({
      ...initialState(),
      saved: current.saved,
      orders: current.orders,
      version: current.version + 1,
    }));
  };
  const showPreview = (offer: MockOffer) => {
    setDetail(offer.id);
    setError("");
  };
  const startOfferBrief = (offer: MockOffer) => {
    setState((current) => ({
      ...sendMessage(
        {
          ...initialState(),
          saved: current.saved,
          orders: current.orders,
          version: current.version,
        },
        `I’m interested in a ${categories[offer.category].toLowerCase()}.`,
      ),
      category: offer.category,
    }));
    setDetail(null);
    setCompared([]);
    setReview(true);
    setError("");
    setNow(Date.now());
  };
  const canSelectDetail =
    state.confirmed &&
    ["results", "approval"].includes(stage) &&
    !state.orders.some(
      (order) => order.id === `order-${state.runStartedAt}-${state.version}`,
    ) &&
    offers.some((offer) => offer.id === detail);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">✦</span>
          <span>
            <strong>BuyerUnion</strong>
            <small>buyer workspace</small>
          </span>
          <span className="brand-chevron">⌄</span>
        </button>
        <nav aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          {(
            [
              ["home", "▦", "Overview"],
              ["chat", "⌕", "Find a bundle"],
              ["saved", "◇", "Saved"],
              ["orders", "□", "Orders"],
            ] as const
          ).map(([target, icon, label]) => (
            <button
              key={target}
              className={
                page === target ||
                (target === "chat" && isJourney && page !== "home")
                  ? "nav-item active"
                  : "nav-item"
              }
              aria-current={page === target ? "page" : undefined}
              onClick={() => go(target)}
            >
              <span>{icon}</span>
              {label}
              {target === "saved" && state.saved.length > 0 ? (
                <small>{state.saved.length}</small>
              ) : null}
            </button>
          ))}
          <span className="nav-label manage">MANAGE</span>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <span>⚙</span>Settings & connections
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Local demo workspace<small>Sample agents · no real purchases</small>
        </div>
        <div className="account">
          <span className="avatar">EC</span>
          <span>
            Elaine Chen<small>Demo buyer account</small>
          </span>
          <span>⌄</span>
        </div>
      </aside>
      <main>
        <div className="topline">
          <span>BUY WITH EVIDENCE</span>
          <span className="mode">
            <i />
            Interactive mock · no payment
          </span>
        </div>
        {isJourney ? (
          <ol className="flow-steps" aria-label="Purchase progress">
            {stepNames.map((name, i) => (
              <li
                key={name}
                className={i <= currentStep ? "reached" : ""}
                aria-current={i === currentStep ? "step" : undefined}
              >
                <span>{i < currentStep ? "✓" : i + 1}</span>
                {name}
              </li>
            ))}
          </ol>
        ) : null}
        {error && !review && !detail ? (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        ) : null}
        {page === "home" ? (
          <>
            <section className="home-hero">
              <span className="intelligence">
                ✦ Your independent shopping workspace
              </span>
              <h1 ref={heading} tabIndex={-1}>
                Good evening, Elaine.
                <br />
                What would you like to explore today?
              </h1>
              <p>Tell us what you need. Let the offers come to you.</p>
              <form className="hero-prompt" onSubmit={submit}>
                <textarea
                  aria-label="What are you looking to buy?"
                  placeholder="I need a laptop for Figma, school, and some video editing…"
                  maxLength={4000}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
                <div>
                  <span>One brief. A few thoughtful offers.</span>
                  <button
                    className="primary"
                    disabled={!input.trim()}
                    type="submit"
                  >
                    Find my options <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>
              <div className="example-prompts">
                <span>TRY A REQUEST</span>
                {[
                  "A laptop for school",
                  "A cotton tee",
                  "A small shelf",
                  "A kitchen kettle",
                ].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => {
                      send(examples[i]);
                      if (i === 0)
                        edit({
                          deadline: deliveryDate(Date.now(), 5),
                          page: "chat",
                        });
                    }}
                  >
                    {label} ↗
                  </button>
                ))}
              </div>
            </section>
            <section className="offers-section">
              <div className="section-header">
                <div>
                  <h2>Suggested offers from merchant agents</h2>
                  <p>
                    A starting point to explore. Confirm a brief to check your
                    options.
                  </p>
                </div>
                <span className="pill">3 sample offers</span>
              </div>
              <div className="offer-grid">
                {cards.map((offer) => (
                  <ProductCard
                    key={offer.id}
                    offer={offer}
                    saved={state.saved.includes(offer.id)}
                    compared={compared.includes(offer.id)}
                    save={() => save(offer.id)}
                    compare={() => toggleCompare(offer.id)}
                    view={() => showPreview(offer)}
                    preview
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
        {page === "chat" ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">01 / 04 · YOUR BRIEF</span>
              <h1 ref={heading} tabIndex={-1}>
                Let’s find the right fit
              </h1>
              <p>
                Describe a product, a goal, or just a situation. Your brief
                stays editable until you confirm it.
              </p>
            </header>
            <div className="split-layout">
              <section className="panel chat-panel">
                <div className="panel-top">
                  <strong>✦ BuyerUnion assistant</strong>
                  <span className="pill neutral">Private conversation</span>
                </div>
                <div
                  className="messages"
                  ref={messages}
                  role="log"
                  aria-label="Shopping conversation"
                >
                  <div className="message assistant">
                    <span>BU</span>
                    <div>
                      <strong>Assistant</strong>
                      <p>
                        What are you trying to buy? Tell me what matters, and
                        we’ll shape a brief together.
                      </p>
                    </div>
                  </div>
                  {state.messages.map((message, i) => (
                    <div
                      key={i}
                      className={`message ${message.role === "buyer" ? "buyer" : "assistant"}`}
                    >
                      {message.role === "assistant" ? <span>BU</span> : null}
                      <div>
                        <strong>
                          {message.role === "buyer"
                            ? "You"
                            : "Assistant · scripted mock"}
                        </strong>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="quick-replies">
                  <small>Quick replies</small>
                  <div>
                    {["Battery first", "Graphics first", "Repairability"].map(
                      (reply) => (
                        <button
                          className="chip"
                          key={reply}
                          onClick={() => {
                            send(reply);
                          }}
                        >
                          {reply}
                        </button>
                      ),
                    )}
                    <button
                      className="chip accent"
                      onClick={() => {
                        setError("");
                        setReview(true);
                      }}
                    >
                      Show me options →
                    </button>
                  </div>
                </div>
                <form className="composer" onSubmit={submit}>
                  <input
                    aria-label="Message the shopping assistant"
                    placeholder="Type a preference or ask a question…"
                    maxLength={4000}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                  <button
                    className="primary icon-button"
                    disabled={!input.trim()}
                    aria-label="Send message"
                  >
                    →
                  </button>
                </form>
              </section>
              <aside className="brief-panel">
                <span className="eyebrow">YOUR BRIEF SO FAR · PROPOSED</span>
                <h2>
                  {state.prompt
                    ? `${categories[state.category]} for your everyday needs`
                    : "A little context goes a long way"}
                </h2>
                <p>Review the details before merchants prepare their offers.</p>
                <hr />
                <span className="eyebrow">CATEGORY</span>
                <div>
                  <span className="pill">{categories[state.category]}</span>
                </div>
                <span className="eyebrow">CONSTRAINTS</span>
                <div className="brief-chips">
                  <span className="pill neutral">
                    {state.budget
                      ? `≤ ${money(Number(state.budget) * 100)} delivered · private`
                      : "Budget not set"}
                  </span>
                  <span className="pill neutral">
                    {state.deadline
                      ? `Arrive by ${state.deadline}`
                      : "Delivery date not set"}
                  </span>
                  <span className="pill neutral">San Francisco</span>
                  <span className="pill neutral">
                    {state.allowRefurbished ? "New or refurbished" : "New only"}
                  </span>
                </div>
                <span className="eyebrow">YOUR PRIORITY</span>
                <p>{state.preference}</p>
                <div className="brief-footer">
                  <p>
                    Your maximum stays private, even after confirmation. Sharing
                    a target is always optional.
                  </p>
                  <button
                    className="light-button"
                    onClick={() => {
                      setReview(true);
                      setError("");
                    }}
                  >
                    Review & confirm brief →
                  </button>
                </div>
              </aside>
            </div>
          </>
        ) : null}
        {page === "progress" ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">02 / 04 · CHECKING OFFERS</span>
              <h1 ref={heading} tabIndex={-1}>
                Your shortlist is taking shape
              </h1>
              <p>
                Sample merchants are preparing offers against the same brief.
                This sequence is a scripted demonstration.
              </p>
            </header>
            <div className="split-layout">
              <section className="panel progress-panel">
                <div className="panel-top">
                  <strong>ONE BOUNDED ROUND · SIMULATED</strong>
                  <span className="pill">3 demo merchants</span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${Math.min(100, elapsed / 65)}%` }} />
                </div>
                <div
                  className="messages"
                  role="log"
                  aria-label="Offer progress"
                >
                  {progressMessages
                    .slice(0, progress + 1)
                    .map(([name, message], i) => (
                      <div
                        key={name}
                        className={`message ${i === 1 ? "buyer" : "assistant"}`}
                      >
                        <span>{i === 2 ? "BU" : i === 0 ? "A" : "B"}</span>
                        <div>
                          <strong>{name} · sample outcome</strong>
                          <p>{message}</p>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="notice">
                  <span className="status-dot" />
                  {progress < 3
                    ? "Checking requirements, delivered prices and permitted revisions…"
                    : "Comparison ready."}
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    edit({ page: "chat" });
                  }}
                >
                  Cancel & edit brief
                </button>
              </section>
              <aside className="brief-panel">
                <span className="eyebrow">CHECKED OUTCOMES</span>
                <h2>Useful changes. Clear limits.</h2>
                <dl className="check-list">
                  <div>
                    <dt>Requirement checks</dt>
                    <dd>
                      {progress >= 1 ? "Sample checks ready" : "Checking…"}
                    </dd>
                  </div>
                  <div>
                    <dt>Commercial terms</dt>
                    <dd>
                      {progress >= 1 ? "Fictional demo policies" : "Checking…"}
                    </dd>
                  </div>
                  <div>
                    <dt>Price revisions</dt>
                    <dd>{progress >= 2 ? "One final round" : "Pending"}</dd>
                  </div>
                  <div>
                    <dt>Owner evidence</dt>
                    <dd>Unavailable</dd>
                  </div>
                </dl>
                <span className="pill">No silent constraint changes</span>
                <p className="brief-footer">
                  No real CREAO or Apify call is made by this mock.
                </p>
              </aside>
            </div>
          </>
        ) : null}
        {page === "results" || page === "saved" ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">
                {page === "saved" ? "YOUR COLLECTION" : "03 / 04 · COMPARE"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {page === "saved"
                  ? "A few worth keeping"
                  : offers.length
                    ? "Good options. Honest trade-offs."
                    : "No offers match this brief yet"}
              </h1>
              <p>
                {page === "saved"
                  ? "Saved sample offers stay on this device. Prices are rechecked after you confirm a request."
                  : "Compare complete prices, delivery and seller terms. You decide what matters most."}
              </p>
            </header>
            {page === "results" ? (
              <div className="comparison-toolbar">
                <div>
                  <span className="pill">
                    {offers.length} matching sample offers
                  </span>
                  <span>
                    Budget {money(Number(state.budget) * 100)} ·{" "}
                    {state.preference}
                  </span>
                </div>
                <label>
                  Sort by{" "}
                  <select
                    aria-label="Sort offers"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="best_fit">
                      Best fit · no score, price first
                    </option>
                    <option value="cheapest">Lowest delivered price</option>
                    <option value="soonest">Soonest arrival</option>
                    <option value="warranty">Longest warranty</option>
                  </select>
                </label>
                <button
                  className="secondary"
                  onClick={() => edit({ page: "chat" })}
                >
                  Edit brief
                </button>
              </div>
            ) : null}
            {cards.length ? (
              <div className="offer-grid">
                {cards.map((offer) => (
                  <ProductCard
                    key={offer.id}
                    offer={offer}
                    saved={state.saved.includes(offer.id)}
                    compared={compared.includes(offer.id)}
                    save={() => save(offer.id)}
                    compare={() => toggleCompare(offer.id)}
                    view={() =>
                      page === "saved"
                        ? showPreview(offer)
                        : setDetail(offer.id)
                    }
                    preview={page === "saved"}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>⌕</span>
                <h2>
                  {page === "saved"
                    ? "Keep your favorites here"
                    : "Try adjusting the limiting requirement"}
                </h2>
                <p>
                  {page === "saved"
                    ? "Use the diamond on any offer to save it for later."
                    : `${noMatchReason(state, now)} Your requirements haven’t been relaxed.`}
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    page === "saved" ? go("home") : edit({ page: "chat" })
                  }
                >
                  {page === "saved" ? "Explore offers" : "Edit my brief"}
                </button>
              </div>
            )}
          </>
        ) : null}
        {page === "approval" && selected && state.quote ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">04 / 04 · APPROVE PURCHASE</span>
              <h1 ref={heading} tabIndex={-1}>
                Approve only the quote you trust
              </h1>
              <p>
                Review this exact product, merchant and delivered total. This is
                a local simulation; no payment will be taken.
              </p>
            </header>
            <div className="split-layout checkout-layout">
              <section className="panel selected-offer">
                <span className="eyebrow">SELECTED OFFER</span>
                <h2>
                  {selected.merchant} · {selected.title}
                </h2>
                <p>{selected.take}</p>
                <div className="selected-product">
                  {selected.image ? (
                    <img
                      src={selected.image}
                      alt="Illustrative laptop workspace"
                    />
                  ) : (
                    <span>{categories[selected.category]}</span>
                  )}
                  <div>
                    <span className="pill">{selected.condition}</span>
                    <h3>{selected.variant} · quantity 1</h3>
                    <p>{selected.specs.join(" · ")}</p>
                  </div>
                </div>
                <dl className="order-details">
                  <div>
                    <dt>Exact configuration</dt>
                    <dd>{selected.specs.join(" · ")}</dd>
                  </div>
                  <div>
                    <dt>Independent evidence</dt>
                    <dd>Owner evidence unavailable · source links only</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>
                      {dateOnlyLabel(state.quote.arrivalDate!)} · San Francisco
                      · fictional
                    </dd>
                  </div>
                  <div>
                    <dt>Warranty / returns</dt>
                    <dd>
                      {selected.warranty} months / {selected.returns} days ·
                      demo seller terms
                    </dd>
                  </div>
                  <div>
                    <dt>Item</dt>
                    <dd>{money(selected.total - selected.shipping)}</dd>
                  </div>
                  <div>
                    <dt>Shipping</dt>
                    <dd>{money(selected.shipping)}</dd>
                  </div>
                  <div>
                    <dt>Tax</dt>
                    <dd>Included in demo price</dd>
                  </div>
                  <div className="total-row">
                    <dt>Delivered total</dt>
                    <dd>{money(state.quote.totalCents)}</dd>
                  </div>
                </dl>
                <span className="pill">Simulation · no real payment</span>
              </section>
              <aside className="brief-panel">
                <span className="eyebrow">FINAL QUOTE RECHECK</span>
                <h2>
                  {timeLeft > 0
                    ? "Everything still matches"
                    : "This quote has expired"}
                </h2>
                <dl className="check-list">
                  <div>
                    <dt>Inventory</dt>
                    <dd>Fictional sample stock</dd>
                  </div>
                  <div>
                    <dt>Confirmed brief</dt>
                    <dd>Version {state.version}</dd>
                  </div>
                  <div>
                    <dt>Private maximum</dt>
                    <dd>{money(Number(state.budget) * 100)}</dd>
                  </div>
                  <div>
                    <dt>Final charges</dt>
                    <dd>{money(state.quote.totalCents)}</dd>
                  </div>
                  <div>
                    <dt>Quote expires</dt>
                    <dd className={timeLeft === 0 ? "warning" : ""}>
                      {Math.floor(timeLeft / 60)}:
                      {String(timeLeft % 60).padStart(2, "0")}
                    </dd>
                  </div>
                </dl>
                <p>
                  You stay in control. Only this button approves these exact
                  demo terms.
                </p>
                <div className="checkout-actions">
                  <button
                    className="light-button"
                    onClick={() => go("results")}
                  >
                    Back to compare
                  </button>
                  <button
                    className="light-button approve-button"
                    disabled={timeLeft === 0}
                    onClick={finish}
                  >
                    Approve {money(state.quote.totalCents)} →
                  </button>
                </div>
                {timeLeft === 0 ? (
                  <button
                    className="light-button"
                    onClick={() => select(selected.id)}
                  >
                    Recheck & renew quote
                  </button>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
        {page === "receipt" ? (
          <section className="receipt panel">
            <span className="success-mark">✓</span>
            <span className="eyebrow">DEMO ORDER COMPLETE</span>
            <h1 ref={heading} tabIndex={-1}>
              A thoughtful choice,
              <br />
              all yours.
            </h1>
            <p>Demo order completed; no payment taken.</p>
            {state.orders.at(-1) ? (
              <div className="receipt-summary">
                <span>
                  {state.orders.at(-1)?.offerSnapshot?.title ??
                    "Legacy demo order · product snapshot unavailable"}
                </span>
                <strong>{money(state.orders.at(-1)!.totalCents)}</strong>
                <small>{state.orders.at(-1)!.id}</small>
              </div>
            ) : null}
            <p className="muted">
              Inventory, order and delivery are simulated. No real stock was
              reserved.
            </p>
            <div className="button-row">
              <button className="secondary" onClick={() => go("orders")}>
                View demo orders
              </button>
              <button className="primary" onClick={newRequest}>
                Start a new request →
              </button>
            </div>
          </section>
        ) : null}
        {page === "orders" ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">YOUR HISTORY</span>
              <h1 ref={heading} tabIndex={-1}>
                Demo orders
              </h1>
              <p>
                Your completed simulations, saved on this device. No real
                purchases or deliveries.
              </p>
            </header>
            {state.orders.length ? (
              <div className="orders-list">
                {[...state.orders].reverse().map((order) => (
                  <article className="panel order-item" key={order.id}>
                    <span className="success-mark small">✓</span>
                    <div>
                      <h3>
                        {order.offerSnapshot?.title ??
                          "Legacy demo order · product snapshot unavailable"}
                      </h3>
                      <p>
                        {dateLabel(order.createdAt)} · {order.id}
                      </p>
                    </div>
                    <strong>{money(order.totalCents)}</strong>
                    <span className="pill">Simulated</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>Your next good find starts here</h2>
                <p>Complete a demo checkout to see it in your history.</p>
                <button className="primary" onClick={() => go("home")}>
                  Find something
                </button>
              </div>
            )}
          </>
        ) : null}
        {page === "settings" ? (
          <>
            <header className="page-heading">
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h1 ref={heading} tabIndex={-1}>
                Settings & connections
              </h1>
              <p>A transparent look at what powers this mock.</p>
            </header>
            <section className="panel settings-panel">
              <h2>Demo environment</h2>
              <dl className="order-details">
                <div>
                  <dt>Buyer agent</dt>
                  <dd>CREAO selected · not connected</dd>
                </div>
                <div>
                  <dt>Persistence</dt>
                  <dd>Browser storage only · Convex not connected</dd>
                </div>
                <div>
                  <dt>Product evidence</dt>
                  <dd>Apify not connected · owner reports unavailable</dd>
                </div>
                <div>
                  <dt>Checkout</dt>
                  <dd>Local simulation · no card data</dd>
                </div>
                <div>
                  <dt>Catalog</dt>
                  <dd>
                    Laptops, clothing, household and appliances · fictional
                    stock
                  </dd>
                </div>
              </dl>
              <p>
                Your conversation and saved items remain in this browser when
                storage is available. Avoid entering sensitive personal
                information into the mock.
              </p>
              <button
                className="secondary danger"
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear all local demo conversations, saved items and orders?",
                    )
                  ) {
                    setState(initialState());
                    setCompared([]);
                    setError("");
                  }
                }}
              >
                Clear local demo data
              </button>
            </section>
          </>
        ) : null}
        <footer className="workspace-footer">
          <span>✦ BuyerUnion</span>Fictional merchants & inventory · scripted
          agents · no real purchases
        </footer>
        {compared.length > 0 && ["home", "results", "saved"].includes(page) ? (
          <div className="compare-bar">
            <div>
              <strong>
                {compared.length} offer{compared.length > 1 ? "s" : ""} selected
              </strong>
              <span>Choose up to three to see the trade-offs.</span>
            </div>
            <button className="text-button" onClick={() => setCompared([])}>
              Clear
            </button>
            <button
              className="primary"
              disabled={compared.length < 2}
              onClick={() => setCompareOpen(true)}
            >
              Compare selected →
            </button>
          </div>
        ) : null}
      </main>
      {review ? (
        <Modal
          title="Here’s what we understood"
          close={() => {
            setReview(false);
            setError("");
          }}
        >
          <p className="muted">
            Confirm the requirements before sample merchants prepare offers. All
            fields below are editable.
          </p>
          <form onSubmit={start} className="brief-form">
            <label>
              Category
              <select
                value={state.category}
                onChange={(event) =>
                  edit({
                    category: event.target.value as MockState["category"],
                  })
                }
              >
                {Object.entries(categories).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-pair">
              <label>
                Private maximum · USD
                <input
                  inputMode="decimal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={state.budget}
                  onChange={(event) => edit({ budget: event.target.value })}
                  placeholder="1000"
                />
                <small>
                  Complete delivered total. Never shared with sellers.
                </small>
              </label>
              <label>
                Arrive by
                <input
                  type="date"
                  required
                  min={dateInput(now)}
                  value={state.deadline}
                  onChange={(event) => edit({ deadline: event.target.value })}
                />
                <small>San Francisco · calendar date</small>
              </label>
            </div>
            <label>
              Priority
              <select
                value={state.preference}
                onChange={(event) => edit({ preference: event.target.value })}
              >
                {[
                  "Balanced",
                  "Battery first",
                  "Graphics first",
                  "Repairability",
                  "Lowest price",
                  "Soonest arrival",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <small>
                Qualitative in this mock; no invented numerical fit score.
              </small>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.allowRefurbished}
                onChange={(event) =>
                  edit({ allowRefurbished: event.target.checked })
                }
              />
              Include refurbished where this category supports it
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.shareTarget}
                onChange={(event) =>
                  edit({ shareTarget: event.target.checked, target: "" })
                }
              />
              I consent to share a separate negotiation target
            </label>
            {state.shareTarget ? (
              <label>
                Shared target · USD
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={state.target}
                  onChange={(event) => edit({ target: event.target.value })}
                />
              </label>
            ) : null}
            <div className="notice">
              Quantity 1 ·{" "}
              {state.category === "laptop"
                ? "Sample configurations: 16GB RAM / 512GB SSD."
                : state.category === "clothing"
                  ? "Sample: DemoWear M, navy, 100% cotton."
                  : state.category === "household_accessory"
                    ? "Sample: 500mm wide wood shelf."
                    : "Sample: 1.5L kettle, 120V / 60Hz, US plug."}{" "}
              This mock uses fixed sample matching; full language interpretation
              comes with the backend.
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="secondary"
                type="button"
                onClick={() => setReview(false)}
              >
                Keep editing
              </button>
              <button className="primary" type="submit">
                Confirm & find offers →
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {detailOffer ? (
        <Modal title={detailOffer.title} close={() => setDetail(null)}>
          <span className="pill">
            {detailOffer.merchant} · {detailOffer.condition}
          </span>
          <h2 className="detail-price">
            {money(detailOffer.total)}{" "}
            <small>delivered · fictional price</small>
          </h2>
          <p>{detailOffer.take}</p>
          <dl className="order-details">
            <div>
              <dt>Configuration</dt>
              <dd>{detailOffer.specs.join(" · ")}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {detailOffer.days} calendar day{detailOffer.days > 1 ? "s" : ""}{" "}
                · simulated
              </dd>
            </div>
            <div>
              <dt>Warranty / returns</dt>
              <dd>
                {detailOffer.warranty} months / {detailOffer.returns} days
              </dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>Owner reports unavailable. No live research performed.</dd>
            </div>
            <div>
              <dt>Important concern</dt>
              <dd>{detailOffer.concern}</dd>
            </div>
          </dl>
          {detailOffer.source ? (
            <a
              className="source-link"
              href={detailOffer.source}
              target="_blank"
              rel="noreferrer"
            >
              Manufacturer specification reference ↗
            </a>
          ) : (
            <p className="muted">
              Fictional product. No manufacturer or review sources.
            </p>
          )}
          <p className="muted">
            Photos are illustrative and do not verify the product, configuration
            or unit condition.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => {
                setDetail(null);
                setError("");
              }}
            >
              Back to offers
            </button>
            <button
              className="primary"
              onClick={() =>
                canSelectDetail
                  ? select(detailOffer.id)
                  : startOfferBrief(detailOffer)
              }
            >
              {canSelectDetail
                ? "Choose & review quote →"
                : "Start a brief for this offer →"}
            </button>
          </div>
        </Modal>
      ) : null}
      {compareOpen ? (
        <Modal
          title="The trade-offs, side by side"
          close={() => setCompareOpen(false)}
        >
          <div className="compare-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>What matters</th>
                  {compared.map((id) => (
                    <th key={id}>
                      {catalog.find((offer) => offer.id === id)?.title}
                      <small>
                        {catalog.find((offer) => offer.id === id)?.merchant}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Delivered price",
                  "Condition",
                  "Delivery",
                  "Warranty",
                  "Returns",
                  "Owner evidence",
                ].map((label, i) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {compared.map((id) => {
                      const offer = catalog.find((item) => item.id === id)!;
                      return (
                        <td key={id}>
                          {
                            [
                              money(offer.total),
                              offer.condition,
                              `${offer.days} day${offer.days === 1 ? "" : "s"}`,
                              `${offer.warranty} months`,
                              `${offer.returns} days`,
                              "Unavailable",
                            ][i]
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Comparing offers doesn’t change your requirements or approve a
            purchase.
          </p>
          <button className="primary" onClick={() => setCompareOpen(false)}>
            Back to offers
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
