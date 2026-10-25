import { comparisonIds, updateComparison, type ComparisonSelection } from "./backend/buyer/comparisonSelection";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { contracts } from "./contracts";
import type { ApiResult, Contract, OfferCard } from "./contracts";
import "./App.css";
import "./BackendApp.css";
type Profile = Contract<"CategoryProfile">;
type Sort = Contract<"RequestVersion">["sort"];
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
const date = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(ms);
const dateInput = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
function endOfDay(day: string) {
  const noon = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(noon)) throw new Error("Choose a delivery date.");
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "longOffset",
  })
    .formatToParts(noon)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return Date.parse(`${day}T23:59:59${offset}`);
}
function unwrap<T>(value: unknown): T {
  const result = value as ApiResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
const clientKey = () => crypto.randomUUID();
const samples = [
  "Windows laptop with 16 GB RAM under $1200",
  "Navy cotton tee, size M, under $40",
  "Small shelf under $100",
  "1.5 litre kettle with a US plug under $60",
];
export default function BackendApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (isLoading) return <div className="connection-screen" role="status">Loading your account…</div>;
  if (isAuthenticated) return <Workspace />;
  return (
    <div className="connection-screen">
      <div className="brand-mark">✦</div>
      <h1>Converge</h1>
      <p>{flow === "signUp" ? "Create your buyer account" : "Sign in to your buyer workspace"}</p>
      <form onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try { await signIn("password", data); }
        catch { setError(flow === "signIn" ? "Could not sign in. Check your email and password." : "Could not create an account. Try signing in if you already have one."); }
        finally { setBusy(false); }
      }}>
        <input type="hidden" name="flow" value={flow} />
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete={flow === "signUp" ? "new-password" : "current-password"} minLength={8} maxLength={256} required /></label>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Connecting…" : flow === "signUp" ? "Create account" : "Sign in"}</button>
        <button type="button" disabled={busy} onClick={() => { setFlow(flow === "signIn" ? "signUp" : "signIn"); setError(""); }}>
          {flow === "signIn" ? "Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
function Workspace() {
  const { signOut } = useAuthActions();
  const requests = useQuery(api.buyer.listRequests, {});
  const profiles = useQuery(api.buyer.getProfiles, {});
  const [requestId, setRequestId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("request"),
  );
  const [page, setPage] = useState("overview");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<OfferCard | null>(null);
  const [comparison, setComparison] = useState<ComparisonSelection>({ runId: null, ids: [] });
  const [detailsOrigin, setDetailsOrigin] = useState<{ requestId: string; runId: string } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const draft = useQuery(
    api.buyer.getDraft,
    requestId ? { requestId } : "skip",
  );
  const confirmed = useQuery(
    api.buyer.getConfirmedRequest,
    requestId ? { requestId } : "skip",
  );
  const active = requests?.find((r) => r.requestId === requestId)?.activeRunId;
  const run = useQuery(
    api.buyer.getBuyerRun,
    requestId && active ? { requestId } : "skip",
  );
  const compared = comparisonIds(comparison, run?.runId ?? null);
  function setCompared(update: string[] | ((ids: string[]) => string[])) {
    setComparison(previous => updateComparison(previous, run?.runId ?? null, update));
  }
  function openDetails(card: OfferCard, origin: { requestId: string; runId: string } | null) {
    setDetails(card);
    setDetailsOrigin(origin);
  }
  const purchase = useQuery(
    api.buyer.getPurchase,
    requestId ? { requestId } : "skip",
  );
  const saved = useQuery(api.buyer.listSaved, page === "saved" ? {} : "skip");
  const orders = useQuery(
    api.buyer.listOrders,
    page === "orders" ? {} : "skip",
  );
  const removeSaved = useAction(api.buyer.removeSaved);
  const saveDraft = useAction(api.buyer.saveDraft),
    interpret = useAction(api.buyer.interpretDraft),
    confirm = useAction(api.buyer.confirmRequest),
    start = useAction(api.buyer.startRun),
    cancel = useAction(api.buyer.cancelRun),
    revise = useAction(api.buyer.reviseRequest),
    select = useAction(api.buyer.selectAndReserve),
    approve = useAction(api.buyer.approveAndExecute),
    sort = useAction(api.buyer.setSort),
    bookmark = useAction(api.buyer.toggleSaved);
  function openRequest(id: string | null) {
    setRequestId(id);
    setPage("overview");
    setError("");
    setCompared([]);
    history.replaceState(
      null,
      "",
      id ? `?request=${encodeURIComponent(id)}` : location.pathname,
    );
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The operation failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    await perform(async () => {
      const next = contracts.DraftView.parse(
        unwrap(
          await saveDraft({
            input: {
              requestId,
              expectedDraftVersion: draft?.draftVersion ?? null,
              message: message.trim(),
            },
          }),
        ),
      );
      openRequest(next.requestId);
      setMessage("");
      unwrap(
        await interpret({
          input: {
            requestId: next.requestId,
            expectedDraftVersion: next.draftVersion,
          },
        }),
      );
    });
  }
  async function confirmBrief(input: Contract<"ConfirmRequestInput">) {
    await perform(async () => {
      const ref = contracts.Ref.parse(unwrap(await confirm({ input })));
      unwrap(await start({ input: { request: ref, clientKey: clientKey() } }));
    });
  }
  async function edit() {
    if (!confirmed || !draft) return;
    await perform(async () => {
      unwrap(
        await revise({
          input: {
            request: confirmed.request,
            changes: {
              messages: draft.messages,
              proposedLines: confirmed.brief.lines,
              proposedDeadline: confirmed.brief.deliveryDeadline,
              proposedPrivateMaximumCents: confirmed.privateMaximumCents,
              proposedSharedTargetCents: null,
              sort: confirmed.sort,
            },
          },
        }),
      );
      setCompared([]);
    });
  }
  useEffect(() => {
    if (purchase?.execution?.executionId)
      document
        .getElementById("purchase-status")
        ?.scrollIntoView({ block: "start" });
  }, [purchase?.execution?.executionId]);
  const locked =
    run && ["executing", "unknown", "complete"].includes(run.purchaseStage);
  const selectedCards = (run?.offers ?? []).filter((o) =>
    compared.includes(o.offer.id),
  );
  return (
    <div className="app-shell backend-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => openRequest(null)}>
          <span className="brand-mark">✦</span>
          <span>
            <strong>Converge</strong>
            <small>buyer workspace</small>
          </span>
        </button>
        <nav>
          <span className="nav-label">WORKSPACE</span>
          {[
            ["overview", "▦", "Overview"],
            ["find", "⌕", "Find a bundle"],
            ["saved", "◇", "Saved"],
            ["orders", "□", "Orders"],
          ].map(([id, icon, label]) => (
            <button
              className={`nav-item ${page === id ? "active" : ""}`}
              key={id}
              onClick={() => (id === "find" ? openRequest(null) : setPage(id))}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
          <span className="nav-label manage">MANAGE</span>
          {["Settings", "Agent profile", "Connections"].map((label) => (
            <button
              className={`nav-item ${page === label ? "active" : ""}`}
              key={label}
              onClick={() => setPage(label)}
            >
              <span>{label === "Connections" ? "↔" : "⚙"}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          Private buyer session
          <small>
            Your requests and approvals are saved to your buyer account.
          </small>
        </div>
        <div className="account">
          <span className="avatar">BU</span>
          <span>
            Buyer account<small>Authenticated workspace</small>
          </span>
        </div>
        <button onClick={() => { history.replaceState(null, "", location.pathname); void signOut().catch(() => setError("Could not sign out. Please try again.")); }}>Sign out</button>
      </aside>
      <main>
        <header className="topline">
          <span>WORKSPACE / {page === "overview" ? "Overview" : page}</span>
          <span className="mode">
            <i />
            Demo merchants · {purchase?.quote?.paymentMode === "stripe_test" ? "Stripe test checkout" : "simulation"}
          </span>
        </header>
        {error && (
          <div className="backend-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {(page === "overview" || page === "find") && (
          <>
            {!requestId ? (
              <>
                <section className="home-hero">
                  <span className="intelligence">YOUR BUYER WORKSPACE</span>
                  <h1>
                    What would you like
                    <br />
                    to explore today?
                  </h1>
                  <p>
                    Describe what matters. Review the brief, compare checked
                    offers, and approve exact terms.
                  </p>
                  <form className="hero-prompt" onSubmit={send}>
                    <textarea
                      aria-label="Shopping request"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="I need a laptop for Figma, school, and some video editing…"
                      maxLength={4000}
                      required
                    />
                    <div>
                      <span>Delivery to San Francisco · USD</span>
                      <button
                        className="primary"
                        disabled={busy || !message.trim()}
                      >
                        {busy ? "Preparing…" : "Find my offers →"}
                      </button>
                    </div>
                  </form>
                  <div className="example-prompts">
                    {samples.map((s) => (
                      <button key={s} onClick={() => setMessage(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="offers-section">
                  <div className="section-header">
                    <div>
                      <h2>Your recent requests</h2>
                      <p>Continue a saved request or start a new one.</p>
                    </div>
                  </div>
                  {requests === undefined ? (
                    <p role="status">Loading requests…</p>
                  ) : requests.length ? (
                    <div className="backend-request-list">
                      {requests.map((r) => (
                        <button
                          className="panel"
                          key={r.requestId}
                          onClick={() => openRequest(r.requestId)}
                        >
                          <strong>{r.title}</strong>
                          <span>
                            {date(r.updatedAt)} ·{" "}
                            {r.activeRunId
                              ? "View progress / results"
                              : "Review brief"}{" "}
                            →
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="panel">
                      <p>
                        Your first request will appear here. No offers are
                        invented before you confirm a brief.
                      </p>
                    </div>
                  )}
                </section>
              </>
            ) : !draft ? (
              <p role="status">Loading your request…</p>
            ) : (
              <>
                <div className="page-heading">
                  <span className="eyebrow">YOUR SHOPPING REQUEST</span>
                  <h1>
                    {run?.purchaseStage === "complete"
                      ? "Your demo order is complete"
                      : run
                        ? "Your merchant comparison"
                        : "Let’s get the details right"}
                  </h1>
                  <p>
                    Fictional inventory and terms.{" "}
                    {run?.modes.agents === "live"
                      ? "Live agent mode."
                      : run?.modes.agents === "mixed"
                        ? "Live buyer agents; deterministic seller fixtures."
                      : "Deterministic agent fixtures."}{" "}
                    {run?.modes.payment === "stripe_test"
                      ? "Stripe test checkout; no real money is charged."
                      : "No payment is taken."}
                  </p>
                </div>
                <div className="backend-actions">
                  <button
                    className="secondary"
                    onClick={() => openRequest(null)}
                  >
                    New request
                  </button>
                  {draft.confirmedRequest && !locked && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void edit()}
                    >
                      Edit brief
                    </button>
                  )}
                  {run?.stage === "results" && !locked && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          unwrap(
                            await start({
                              input: {
                                request: run.request,
                                clientKey: clientKey(),
                              },
                            }),
                          );
                          setCompared([]);
                        })
                      }
                    >
                      Refresh comparison
                    </button>
                  )}
                  {run?.allowedActions.includes("cancel") && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          unwrap(
                            await cancel({
                              input: { request: run.request, runId: run.runId },
                            }),
                          );
                        })
                      }
                    >
                      Cancel run
                    </button>
                  )}
                </div>
                {!draft.confirmedRequest && (
                  <div className="split-layout">
                    <section className="panel chat-panel">
                      <div className="panel-top">
                        <strong>Tell your buyer agent</strong>
                        <span className="pill neutral">
                          Private conversation
                        </span>
                      </div>
                      <div className="messages">
                        {draft.messages.map((m) => (
                          <article className={`message ${m.role}`} key={m.id}>
                            <span>
                              {m.role === "buyer" ? "You" : "Buyer assistant"}
                            </span>
                            <p>{m.text}</p>
                          </article>
                        ))}
                      </div>
                      <form className="backend-chat" onSubmit={send}>
                        <textarea
                          aria-label="Add request detail"
                          placeholder="Add a requirement or answer a question…"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          maxLength={4000}
                          required
                        />
                        <button
                          className="primary"
                          disabled={busy || !message.trim()}
                        >
                          Send
                        </button>
                      </form>
                      {!!draft.interpretation?.suggestedReplies.length && (
                        <div className="example-prompts">
                          {draft.interpretation.suggestedReplies.map(
                            (reply) => (
                              <button
                                key={reply.id}
                                onClick={() => setMessage(reply.text)}
                              >
                                {reply.label}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      {!draft.interpretation && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void perform(async () => {
                              unwrap(
                                await interpret({
                                  input: {
                                    requestId: draft.requestId,
                                    expectedDraftVersion: draft.draftVersion,
                                  },
                                }),
                              );
                            })
                          }
                        >
                          Interpret current draft
                        </button>
                      )}
                    </section>
                    {profiles && (
                      <BriefForm
                        key={`${draft.requestId}:${draft.draftVersion}:${!!draft.interpretation}`}
                        draft={draft}
                        profiles={profiles}
                        busy={busy}
                        onConfirm={confirmBrief}
                      />
                    )}
                  </div>
                )}
                {draft.confirmedRequest && !run && (
                  <section className="panel">
                    <h2>Brief confirmed</h2>
                    <p>
                      Your request is saved. Start the merchant comparison when
                      ready.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          unwrap(
                            await start({
                              input: {
                                request: draft.confirmedRequest,
                                clientKey: clientKey(),
                              },
                            }),
                          );
                        })
                      }
                    >
                      Start comparison
                    </button>
                  </section>
                )}
                {run && (
                  <>
                    <section
                      className="panel backend-progress"
                      aria-live="polite"
                    >
                      <div className="section-header">
                        <div>
                          <span className="eyebrow">
                            {run.councilPhase ? `council · ${run.councilPhase}` : run.stage.replaceAll("_", " ")}
                          </span>
                          <h2>
                            {run.stage === "results"
                              ? "Checked offers, ready to compare"
                              : run.stage === "no_match"
                                ? "No offer meets every confirmed requirement"
                                : run.stage === "cancelled"
                                  ? "This run was cancelled"
                                  : run.stage === "failed"
                                    ? "The run could not finish"
                                    : "Your merchants are checking the brief"}
                          </h2>
                          <p>
                            {run.participatingMerchantCount} participating
                            merchants · {run.completedMerchantCount} initial
                            responses · evidence {run.evidenceStatus}
                          </p>
                        </div>
                        <span className="pill neutral">
                          {run.modes.agents} agents
                        </span>
                      </div>
                      {run.councilStatus.length > 0 && <ul aria-label="Council phase progress">
                        {run.councilStatus.map(status => <li key={status.phase}>
                          {status.phase}: {status.completed}/{status.expected} checked{status.closed ? ` · ${status.missing} unavailable` : ""}
                        </li>)}
                      </ul>}
                      {run.finalStatus.invited > 0 && <p>{run.finalStatus.received}/{run.finalStatus.invited} final decisions received · {run.finalStatus.unavailable} unavailable. Prices stay sealed until closure.</p>}
                      {run.error && <p role="alert">{run.error.message}</p>}
                      <details>
                        <summary>
                          View actual run activity ({run.events.length})
                        </summary>
                        <ol className="backend-events">
                          {run.events.map((event) => (
                            <li key={event.id}>
                              <time>
                                {new Date(event.createdAt).toLocaleTimeString()}
                              </time>
                              <span>{event.summary}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                      {["failed", "no_match", "cancelled"].includes(
                        run.stage,
                      ) &&
                        !locked && (
                          <div className="backend-actions">
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => void edit()}
                            >
                              Revise requirements
                            </button>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void perform(async () => {
                                  unwrap(
                                    await start({
                                      input: {
                                        request: run.request,
                                        clientKey: clientKey(),
                                      },
                                    }),
                                  );
                                })
                              }
                            >
                              Retry current brief
                            </button>
                          </div>
                        )}
                    </section>
                    {purchase?.execution && (
                      <section
                        id="purchase-status"
                        className="panel backend-receipt"
                        aria-live="polite"
                      >
                        <span className="eyebrow">
                          PURCHASE · {purchase.execution.status}
                        </span>
                        <h2>{purchase.execution.resultMessage}</h2>
                        <p>Attempt {purchase.execution.executionId}</p>
                        {purchase.execution.status === "pending" && purchase.execution.checkoutUrl && (
                          <a className="primary" href={purchase.execution.checkoutUrl}>Continue to Stripe payment</a>
                        )}
                        {purchase.execution.orderId && (
                          <p>Order {purchase.execution.orderId}</p>
                        )}
                        {["unknown", "pending"].includes(
                          purchase.execution.status,
                        ) && (
                          <p>
                            Your stock stays locked while this same attempt is
                            resolved. You can leave this page and return to the
                            saved request.
                          </p>
                        )}
                      </section>
                    )}
                    {run.offers.length > 0 && (
                      <section className="offers-section">
                        <div className="section-header">
                          <div>
                            <h2>Offers from merchant agents</h2>
                            <p>
                              Delivered totals include shipping once and zero
                              demo tax. Stock is checked again when you select.
                            </p>
                          </div>
                          <label>
                            Sort{" "}
                            <select
                              aria-label="Sort offers"
                              defaultValue={confirmed?.sort ?? "best_fit"}
                              onChange={(e) =>
                                void perform(async () => {
                                  unwrap(
                                    await sort({
                                      input: {
                                        request: run.request,
                                        runId: run.runId,
                                        sort: e.target.value,
                                      },
                                    }),
                                  );
                                })
                              }
                            >
                              {[
                                ["best_fit", "Best fit"],
                                ["cheapest", "Lowest delivered total"],
                                ["soonest", "Soonest arrival"],
                                ["warranty", "Longest warranty"],
                              ].map(([v, l]) => (
                                <option value={v} key={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="offer-grid">
                          {run.offers.map((card, i) => (
                            <Offer
                              key={`${card.offer.id}:${card.offer.version}`}
                              card={card}
                              index={i}
                              busy={busy || !!locked}
                              compared={compared.includes(card.offer.id)}
                              onCompare={() =>
                                setCompared((prev) =>
                                  prev.includes(card.offer.id)
                                    ? prev.filter((id) => id !== card.offer.id)
                                    : prev.length < 3
                                      ? [...prev, card.offer.id]
                                      : prev,
                                )
                              }
                              onDetails={() => openDetails(card, { requestId: requestId!, runId: run.runId })}
                              onSave={() =>
                                void perform(async () => {
                                  unwrap(
                                    await bookmark({
                                      input: { requestId, offer: card.offer },
                                    }),
                                  );
                                })
                              }
                              onSelect={() =>
                                void perform(async () => {
                                  unwrap(
                                    await select({
                                      input: {
                                        request: run.request,
                                        runId: run.runId,
                                        offer: card.offer,
                                        clientKey: clientKey(),
                                      },
                                    }),
                                  );
                                })
                              }
                            />
                          ))}
                        </div>
                        {selectedCards.length > 0 && (
                          <div className="backend-compare-bar">
                            <span>
                              {selectedCards.length} of 3 offers selected
                            </span>
                            <button
                              className="primary"
                              disabled={selectedCards.length < 2}
                              onClick={() => setShowCompare(true)}
                            >
                              Compare side by side
                            </button>
                            <button
                              className="secondary"
                              onClick={() => setCompared([])}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                    {purchase?.quote &&
                      ["reserved", "expired"].includes(
                        purchase.quoteState ?? "",
                      ) && (
                        <QuotePanel
                          key={purchase.quote.quoteId}
                          products={purchase.products}
                          quote={purchase.quote}
                          busy={busy}
                          onApprove={() =>
                            void perform(async () => {
                              unwrap(
                                await approve({
                                  input: {
                                    request: run.request,
                                    quoteId: purchase.quote!.quoteId,
                                    quoteHash: purchase.quote!.quoteHash,
                                    clientKey: `approve:${purchase.quote!.quoteId}`,
                                  },
                                }),
                              );
                            })
                          }
                        />
                      )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {page === "saved" && (
          <section className="offers-section">
            <div className="page-heading">
              <h1>Saved offers</h1>
              <p>
                Bookmarks preserve a comparison snapshot. Open the original
                request for a fresh stock and price check.
              </p>
            </div>
            <div className="offer-grid">
              {saved?.map((s) => (
                <article className="panel backend-saved" key={s.id}>
                  <span className="eyebrow">SAVED SNAPSHOT</span>
                  <h2>{s.card.products[0].title}</h2>
                  <p>
                    {s.card.merchant.displayName} · {money(s.card.totalCents)}{" "}
                    delivered
                  </p>
                  <p>{s.card.mainConcern}</p>
                  <div className="backend-actions">
                    <button
                      className="secondary"
                      onClick={() => openDetails(s.card, s.requestId && s.runId ? { requestId: s.requestId, runId: s.runId } : null)}
                    >
                      Details
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          unwrap(
                            await removeSaved({ input: { bookmarkId: s.id } }),
                          );
                        })
                      }
                    >
                      Remove saved offer
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {saved?.length === 0 && <p>No saved offers yet.</p>}
          </section>
        )}
        {page === "orders" && (
          <section className="offers-section">
            <div className="page-heading">
              <h1>Your orders</h1>
              <p>Your completed orders and frozen purchase details.</p>
            </div>
            {orders?.map((o) => (
              <article className="panel backend-receipt" key={o.orderId}>
                <span className="eyebrow">
                  DEMO ORDER · {date(o.createdAt)}
                </span>
                <h2>{money(o.quote.totalCents)} delivered</h2>
                <p>
                  {o.products
                    .map(
                      (p: { title: string; quantity: number }) =>
                        `${p.quantity} × ${p.title}`,
                    )
                    .join(" + ")}
                </p>
                <p>
                  {o.quote.paymentMode === "stripe_test"
                    ? "Stripe test payment completed; no real money charged."
                    : "Demo order completed; no payment taken."}
                </p>
                <button
                  className="secondary"
                  onClick={() => openRequest(o.requestId)}
                >
                  View request and receipt
                </button>
              </article>
            ))}
            {orders?.length === 0 && <p>No completed orders yet.</p>}
          </section>
        )}
        {["Settings", "Agent profile", "Connections"].includes(page) && (
          <section className="panel backend-settings">
            <h1>{page}</h1>
            {page === "Connections" ? (
              <>
                <p>
                  Your workspace uses Convex persistence and account authentication.
                </p>
                <p>
                  CREAO buyer agents and Apify evidence use server configuration.
                  Seller agents remain deterministic fixtures; checkout is simulated.
                </p>
                <p>
                  {run
                    ? `Selected request: ${run.modes.agents} agents; ${run.modes.evidence} evidence.`
                    : "Open a request to inspect its recorded agent and evidence modes."}
                </p>
                <p>Credentials belong in server configuration.</p>
              </>
            ) : page === "Agent profile" ? (
              <>
                <h2>Your requirements lead the comparison</h2>
                <p>
                  Hard requirements must pass. Soft preferences use weights of 1
                  or 2; missing facts remain in the denominator. No preferences
                  means no numeric score.
                </p>
                <p>
                  Merchants only receive the confirmed product brief and an
                  optional target you explicitly consent to share. They never
                  receive your private ceiling or conversation.
                </p>
              </>
            ) : (
              <>
                <h2>Request-specific preferences</h2>
                <p>
                  Set your private ceiling, optional shared target, conditions,
                  quantity, delivery deadline and fit preferences in each brief.
                  Revising a brief cancels its old run and requires fresh
                  confirmation and target consent.
                </p>
                <p>
                  Checkout supports simulation or Stripe test payments. Delivery region is San Francisco;
                  currency is USD.
                </p>
              </>
            )}
          </section>
        )}
        <footer className="workspace-footer">
          <span>Converge · disclosed demo commerce</span>
          <span>Backend owns prices, stock, approvals and orders</span>
        </footer>
      </main>
      {details && (
        <Modal
          title={details.products[0].title}
          onClose={() => setDetails(null)}
        >
          <OfferFacts card={details} />
          {detailsOrigin ? (
            <Evidence requestId={detailsOrigin.requestId} runId={detailsOrigin.runId} ids={details.evidenceIds} />
          ) : <p>Archived evidence is unavailable for this older saved snapshot.</p>}
        </Modal>
      )}
      {showCompare && selectedCards.length >= 2 && (
        <Modal title="Compare offers" onClose={() => setShowCompare(false)}>
          <div className="backend-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  {selectedCards.map((c) => (
                    <th key={c.offer.id}>
                      {c.merchant.displayName}
                      <br />
                      {c.products[0].title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Delivered total",
                    ...selectedCards.map((c) => money(c.totalCents)),
                  ],
                  [
                    "Arrival by",
                    ...selectedCards.map((c) => date(c.arrivalAt)),
                  ],
                  [
                    "Warranty",
                    ...selectedCards.map((c) => `${c.warrantyMonths} months`),
                  ],
                  [
                    "Returns",
                    ...selectedCards.map((c) => `${c.returnDays} days`),
                  ],
                  [
                    "Soft preference coverage",
                    ...selectedCards.map((c) =>
                      c.fit.coveragePercent === null
                        ? "No scored preferences"
                        : `${Math.round(c.fit.coveragePercent)}%`,
                    ),
                  ],
                  ["Evidence", ...selectedCards.map((c) => c.evidenceStatus)],
                  ["Main concern", ...selectedCards.map((c) => c.mainConcern)],
                ].map(([label, ...values]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {values.map((value, i) => (
                      <td key={i}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
function BriefForm({
  draft,
  profiles,
  busy,
  onConfirm,
}: {
  draft: Contract<"DraftView">;
  profiles: Profile[];
  busy: boolean;
  onConfirm: (input: Contract<"ConfirmRequestInput">) => Promise<void>;
}) {
  const [today] = useState(() => dateInput(Date.now()));
  const proposed = draft.interpretation;
  const [lines, setLines] = useState<Contract<"RequestLine">[]>(
    () => proposed?.proposedLines ?? [],
  );
  const [maximum, setMaximum] = useState(
    proposed?.proposedPrivateMaximumCents
      ? String(proposed.proposedPrivateMaximumCents / 100)
      : "",
  );
  const [deadline, setDeadline] = useState(
    proposed?.proposedDeadline ? dateInput(proposed.proposedDeadline) : "",
  );
  const [share, setShare] = useState(false);
  const [target, setTarget] = useState("");
  const [sort, setSort] = useState<Sort>("best_fit");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  function makeLine(profile: Profile, index: number): Contract<"RequestLine"> {
    return {
      lineId: `line-${crypto.randomUUID()}`,
      role: index === 0 ? "primary" : "related",
      category: profile.category,
      profile: profile.profile,
      quantity: 1,
      allowedConditions: [...profile.allowedConditions],
      requirements: [],
      useCaseSummary: `Request for ${profile.category.replaceAll("_", " ")}.`,
    };
  }
  function update(index: number, patch: Partial<Contract<"RequestLine">>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
    setChecked(false);
  }
  function reqUpdate(
    index: number,
    reqIndex: number,
    patch: Partial<Contract<"Requirement">>,
  ) {
    update(index, {
      requirements: lines[index].requirements.map((r, i) =>
        i === reqIndex ? { ...r, ...patch } : r,
      ),
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!checked) throw new Error("Confirm the brief before starting.");
      const input = contracts.ConfirmRequestInput.parse({
        requestId: draft.requestId,
        expectedDraftVersion: draft.draftVersion,
        lines,
        deliveryDeadline: endOfDay(deadline),
        privateMaximumCents: Math.round(Number(maximum) * 100),
        sharedTargetCents: share ? Math.round(Number(target) * 100) : null,
        shareTarget: share,
        sort,
      });
      await onConfirm(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the brief fields.");
    }
  }
  return (
    <form className="panel backend-brief" onSubmit={submit}>
      <div className="panel-top">
        <strong>Review your brief</strong>
        <span className="pill neutral">Confirmation required</span>
      </div>
      <p>
        Only these confirmed product details go to merchants. Your conversation
        and maximum stay private.
      </p>
      {lines.map((line, index) => {
        const profile = profiles.find(
          (p) =>
            p.profile.id === line.profile.id &&
            p.profile.version === line.profile.version,
        );
        return (
          <fieldset key={line.lineId}>
            <legend>
              {index === 0 ? "Primary item" : `Related item ${index}`}
            </legend>
            <label>
              Category
              <select
                value={line.category}
                onChange={(e) => {
                  const p = profiles.find(
                    (p) => p.category === e.target.value,
                  )!;
                  setLines((prev) =>
                    prev.map((l, i) => (i === index ? makeLine(p, index) : l)),
                  );
                  setChecked(false);
                }}
              >
                {profiles
                  .filter((p) => index !== 0 || p.category !== "tech_accessory")
                  .map((p) => (
                    <option key={p.profile.id} value={p.category}>
                      {p.category.replaceAll("_", " ")}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={10}
                value={line.quantity}
                onChange={(e) =>
                  update(index, { quantity: Number(e.target.value) })
                }
                required
              />
            </label>
            <div className="backend-checks">
              {profile?.allowedConditions.map((condition) => (
                <label key={condition}>
                  <input
                    type="checkbox"
                    checked={line.allowedConditions.includes(condition)}
                    onChange={(e) =>
                      update(index, {
                        allowedConditions: e.target.checked
                          ? [...line.allowedConditions, condition]
                          : line.allowedConditions.filter(
                              (c) => c !== condition,
                            ),
                      })
                    }
                  />
                  {condition}
                </label>
              ))}
            </div>
            {line.requirements.map((r, ri) => {
              const field = profile?.fields.find((f) => f.id === r.fieldId);
              return (
                <div className="backend-requirement" key={r.id}>
                  <label>
                    Attribute
                    <select
                      value={r.fieldId}
                      onChange={(e) => {
                        const f = profile!.fields.find(
                          (f) => f.id === e.target.value,
                        )!;
                        reqUpdate(index, ri, {
                          fieldId: f.id,
                          operator: f.allowedOperators[0],
                          unit: f.unit,
                          value:
                            f.kind === "number"
                              ? (f.minimum ?? 0)
                              : f.kind === "boolean"
                                ? true
                                : f.kind === "string_array"
                                  ? []
                                  : (f.allowedValues?.[0] ?? ""),
                        });
                      }}
                    >
                      {profile?.fields.map((f) => (
                        <option value={f.id} key={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rule
                    <select
                      value={r.operator}
                      onChange={(e) =>
                        reqUpdate(index, ri, {
                          operator: e.target
                            .value as Contract<"Requirement">["operator"],
                          value:
                            e.target.value === "in" && !Array.isArray(r.value)
                              ? [String(r.value)]
                              : e.target.value !== "in" &&
                                  Array.isArray(r.value) &&
                                  field?.kind === "string"
                                ? (r.value[0] ?? "")
                                : r.value,
                        })
                      }
                    >
                      {field?.allowedOperators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Value {r.unit && `(${r.unit})`}
                    {field?.allowedValues && r.operator !== "in" ? (
                      <select
                        value={String(r.value)}
                        onChange={(e) =>
                          reqUpdate(index, ri, { value: e.target.value })
                        }
                      >
                        {field.allowedValues.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    ) : field?.kind === "boolean" ? (
                      <select
                        value={String(r.value)}
                        onChange={(e) =>
                          reqUpdate(index, ri, {
                            value: e.target.value === "true",
                          })
                        }
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        required
                        type={field?.kind === "number" ? "number" : "text"}
                        step="any"
                        value={
                          Array.isArray(r.value)
                            ? r.value.join(", ")
                            : String(r.value)
                        }
                        onChange={(e) =>
                          reqUpdate(index, ri, {
                            value:
                              field?.kind === "number"
                                ? Number(e.target.value)
                                : field?.kind === "string_array" ||
                                    r.operator === "in"
                                  ? e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                  : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                  <label>
                    Priority
                    <select
                      value={
                        r.strength === "hard" ? "hard" : `soft-${r.weight}`
                      }
                      onChange={(e) =>
                        reqUpdate(index, ri, {
                          strength: e.target.value === "hard" ? "hard" : "soft",
                          weight: e.target.value === "soft-2" ? 2 : 1,
                        })
                      }
                    >
                      <option value="hard">Must have</option>
                      <option value="soft-1">Prefer · weight 1</option>
                      <option value="soft-2">Prefer · weight 2</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove requirement ${ri + 1}`}
                    onClick={() =>
                      update(index, {
                        requirements: line.requirements.filter(
                          (_, i) => i !== ri,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const f = profile!.fields[0];
                update(index, {
                  requirements: [
                    ...line.requirements,
                    {
                      id: `req-${crypto.randomUUID()}`,
                      fieldId: f.id,
                      operator: f.allowedOperators[0],
                      value:
                        f.kind === "number"
                          ? (f.minimum ?? 0)
                          : f.kind === "boolean"
                            ? true
                            : f.kind === "string_array"
                              ? []
                              : (f.allowedValues?.[0] ?? ""),
                      unit: f.unit,
                      strength: "hard",
                      weight: 1,
                    },
                  ],
                });
              }}
            >
              + Requirement
            </button>
            {index > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
              >
                Remove item
              </button>
            )}
          </fieldset>
        );
      })}
      {lines.length < 3 && (
        <button
          type="button"
          className="secondary"
          disabled={!profiles.length}
          onClick={() => {
            setLines((prev) => [
              ...prev,
              makeLine(
                profiles.find(
                  (p) =>
                    p.category === (prev.length ? "tech_accessory" : "laptop"),
                ) ?? profiles[0],
                prev.length,
              ),
            ]);
            setChecked(false);
          }}
        >
          + {lines.length ? "Related item" : "Primary item"}
        </button>
      )}
      <label>
        Private maximum delivered total (USD)
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={maximum}
          required
          onChange={(e) => {
            setMaximum(e.target.value);
            setChecked(false);
          }}
        />
      </label>
      <p className="backend-help">
        Never shared with merchants. Includes all quantities and shipping.
      </p>
      <label>
        Arrive by (San Francisco)
        <input
          type="date"
          value={deadline}
          min={today}
          required
          onChange={(e) => {
            setDeadline(e.target.value);
            setChecked(false);
          }}
        />
      </label>
      <label className="backend-consent">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            setTarget("");
            setChecked(false);
          }}
        />
        I consent to share a separate target with merchants for this request
        version.
      </label>
      {share && (
        <label>
          Shared target delivered total (USD)
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={maximum}
            value={target}
            required
            onChange={(e) => {
              setTarget(e.target.value);
              setChecked(false);
            }}
          />
        </label>
      )}
      <label>
        Default comparison
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="best_fit">Best fit</option>
          <option value="cheapest">Lowest delivered total</option>
          <option value="soonest">Soonest arrival</option>
          <option value="warranty">Longest warranty</option>
        </select>
      </label>
      <label className="backend-consent">
        <input
          type="checkbox"
          checked={checked}
          required
          onChange={(e) => setChecked(e.target.checked)}
        />
        I reviewed these product requirements, conditions, quantities, deadline
        and delivered-price limits.
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy || !lines.length || !checked}>
        {busy ? "Saving and starting…" : "Confirm brief & compare offers"}
      </button>
    </form>
  );
}
function Offer({
  card,
  index,
  busy,
  compared,
  onCompare,
  onDetails,
  onSave,
  onSelect,
}: {
  card: OfferCard;
  index: number;
  busy: boolean;
  compared: boolean;
  onCompare: () => void;
  onDetails: () => void;
  onSave: () => void;
  onSelect: () => void;
}) {
  const laptop =
    /laptop|macbook|thinkpad|demothink|demobook|framework|zenbook/i.test(
      card.products[0].title,
    );
  return (
    <article className={`offer-card ${compared ? "is-compared" : ""}`}>
      <div className="product-visual">
        {laptop ? (
          <img
            src={`/images/laptop-${["workspace", "studio", "editing"][index % 3]}.png`}
            alt="Laptop illustration; see exact configuration below"
          />
        ) : (
          <span className="backend-product-symbol" aria-hidden="true">
            ◇
          </span>
        )}
        <span className="condition-pill">{card.products[0].condition}</span>
        <button
          className="save-button"
          disabled={busy}
          onClick={onSave}
          aria-label={`Toggle saved ${card.products[0].title}`}
        >
          ◇
        </button>
      </div>
      <div className="offer-body">
        <p className="merchant-name">
          {card.merchant.displayName} · fictional merchant
        </p>
        <div className="product-title">
          <h3>{card.products[0].title}</h3>
          <strong>{money(card.totalCents)}</strong>
        </div>
        <p className="price-caption">
          Delivered total ·{" "}
          {card.products.map((p) => `${p.quantity} × ${p.title}`).join(" + ")}
        </p>
        <div className="specs">
          <span>By {date(card.arrivalAt)}</span>
          <span>{card.warrantyMonths} mo warranty</span>
          <span>{card.returnDays} day returns</span>
        </div>
        <div className="offer-copy">
          <span className="eyebrow">REQUIREMENT FIT</span>
          <p>
            {card.fit.coveragePercent === null
              ? "No scored preferences"
              : `${Math.round(card.fit.coveragePercent)}% weighted preference coverage`}{" "}
            · hard checks {card.fit.hardRequirementsPass ? "pass" : "fail"}
          </p>
          <p>{card.fitArgument}</p>
        </div>
        <div className="tradeoff">
          <span className="eyebrow">MAIN CONCERN</span>
          <p>{card.mainConcern}</p>
        </div>
        <button className="evidence-link" onClick={onDetails}>
          ↗ {card.evidenceIds.length} evidence excerpts ·{" "}
          {card.evidenceStatus}
        </button>
        <div className="card-actions">
          <button
            className="secondary"
            onClick={onCompare}
            aria-pressed={compared}
          >
            {compared ? "Compared ✓" : "Compare"}
          </button>
          <button className="secondary" onClick={onDetails}>
            Details
          </button>
          <button
            className="primary"
            disabled={busy || !card.selectable}
            onClick={onSelect}
          >
            Select offer
          </button>
        </div>
        {card.unavailableReason && <p>{card.unavailableReason}</p>}
      </div>
    </article>
  );
}
function OfferFacts({ card }: { card: OfferCard }) {
  return (
    <>
      <p>
        {card.merchant.displayName} · {money(card.totalCents)} delivered ·
        arrival by {date(card.arrivalAt)}
      </p>
      <p>
        {card.products
          .map((p) => `${p.quantity} × ${p.title} (${p.condition})`)
          .join(" + ")}
      </p>
      <p>{card.fitArgument}</p>
      <ul>
        {card.fit.checks.map((c) => (
          <li key={c.requirementId}>
            <strong>
              {c.requirementId}: {c.status}
            </strong>{" "}
            ·{" "}
            {Array.isArray(c.actual)
              ? c.actual.join(", ")
              : String(c.actual ?? "Unknown")}
            <p>{c.explanation}</p>
          </li>
        ))}
      </ul>
      <p>{card.mainConcern}</p>
      <p>
        Offer version {card.offer.version}; valid until{" "}
        {new Date(card.expiresAt).toLocaleTimeString()}. Selection rechecks
        stock, policy and delivered total.
      </p>
    </>
  );
}
function Evidence({ requestId, runId, ids }: { requestId: string; runId?: string; ids: string[] }) {
  const evidence = useQuery(api.buyer.getEvidence, {
    requestId,
    evidenceIds: ids,
    ...(runId ? { runId } : {}),
  });
  return (
    <section>
      <h3>Applicable source evidence</h3>
      {!ids.length ? (
        <p>
          No applicable independent or owner evidence is available. No ratings
          or reviews have been invented.
        </p>
      ) : !evidence ? (
        <p>Loading source excerpts…</p>
      ) : evidence.length === 0 ? (
        <p>These source excerpts are no longer available.</p>
      ) : (
        evidence.map((e) => (
          <article className="panel" key={e.id}>
            <a href={e.url} target="_blank" rel="noreferrer">
              {e.sourceType.replaceAll("_", " ")} ↗
            </a>
            <p>{e.claim}</p>
            <blockquote>{e.excerpt}</blockquote>
            <p>
              {e.applicability.replaceAll("_", " ")} · {e.verification} ·
              retrieved {date(e.retrievedAt)}
            </p>
            {e.sourceVerifiedPurchaseLabel && (
              <p>Source label: {e.sourceVerifiedPurchaseLabel}</p>
            )}
          </article>
        ))
      )}
    </section>
  );
}
function QuotePanel({
  quote,
  products,
  busy,
  onApprove,
}: {
  quote: Contract<"FirmQuote">;
  products: {
    requestLineId: string;
    title: string;
    variantId: string;
    condition: string;
    quantity: number;
    attributes: Record<
      string,
      { value: unknown; unit: string | null; provenance: string }
    >;
    diagnostics: Record<
      string,
      { value: unknown; unit: string | null; provenance: string }
    >;
  }[];
  busy: boolean;
  onApprove: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start" });
  }, []);
  const [now, setNow] = useState(Date.now);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((quote.expiresAt - now) / 1000));
  return (
    <section className="panel backend-quote" ref={panel}>
      <span className="eyebrow">EXACT TERMS · FIRM QUOTE</span>
      <h2>{money(quote.totalCents)} delivered</h2>
      <p>
        Shipping {money(quote.shippingCents)} · demo tax $0 · arrival by{" "}
        {date(quote.arrivalAt)}
      </p>
      <p>
        {quote.warrantyMonths} month warranty · {quote.returnDays} day returns
      </p>
      <ul>
        {quote.lines.map((l) => (
          <li key={l.requestLineId}>
            {l.quantity} ×{" "}
            {products.find((p) => p.requestLineId === l.requestLineId)?.title ??
              l.listing.id}{" "}
            (
            {
              products.find((p) => p.requestLineId === l.requestLineId)
                ?.condition
            }
            ) · listing {l.listing.id} v{l.listing.version} ·{" "}
            {money(l.unitCents)} each
          </li>
        ))}
      </ul>
      {products.map((p) => (
        <details key={p.requestLineId}>
          <summary>
            Exact facts: {p.title} · {p.variantId}
          </summary>
          <ul>
            {Object.entries({ ...p.attributes, ...p.diagnostics }).map(
              ([field, attr]) => (
                <li key={field}>
                  {field}:{" "}
                  {Array.isArray(attr.value)
                    ? attr.value.join(", ")
                    : String(attr.value ?? "Unknown")}{" "}
                  {attr.unit ?? ""} · {attr.provenance.replaceAll("_", " ")}
                </li>
              ),
            )}
          </ul>
        </details>
      ))}
      <p role="timer">
        {remaining
          ? `Stock held for ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
          : "Quote expired. Select an offer again to renew and review the terms."}
      </p>
      <p>
        {quote.paymentMode === "stripe_test" ? "Stripe test checkout. Use a test card; no real money is charged." : "Simulation. No card or payment is required."}
      </p>
      <label className="backend-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I approve this exact configuration, quantity, delivered total and
        commercial terms for this {quote.paymentMode === "stripe_test" ? "Stripe test purchase" : "simulated order"}.
      </label>
      <button
        className="primary"
        disabled={busy || !remaining || !consent}
        onClick={onApprove}
      >
        {busy ? "Submitting approval…" : quote.paymentMode === "stripe_test" ? "Approve and continue to payment" : "Approve simulated order"}
      </button>
    </section>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="backend-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-top">
        <h2>{title}</h2>
        <button
          className="secondary"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
