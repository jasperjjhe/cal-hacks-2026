import { useEffect, useRef, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { contracts } from "../contracts";
import type { Contract, OfferCard } from "../contracts";
import {
  comparisonIds,
  updateComparison,
  type ComparisonSelection,
} from "../backend/buyer/comparisonSelection";
import { AuthScreen } from "./Auth";
import { Chat } from "./Chat";
import { Checkout } from "./Checkout";
import { Home } from "./Home";
import type { SavedOffer, Suggested } from "./Home";
import { EvidenceView, OrdersView, SavedView } from "./Pages";
import { Product } from "./Product";
import { CompareTable, Converging, EndedState, Offers } from "./Results";
import { Chip, Dialog, Navbar, PromptBox } from "./ui";
import type { NavId } from "./ui";
import { clientKey, greeting, unwrap } from "./format";
import { matches, requirementLabels } from "./labels";
import "./converge.css";

type Sort = Contract<"RequestVersion">["sort"];
type View = NavId | "saved";
type Toast = { kind: "error" | "info"; text: string } | null;
type Detail = {
  card: OfferCard;
  index: number;
  origin: { requestId: string; runId: string } | null;
};

const running = ["bidding", "council", "negotiating", "researching"];

export default function ConvergeApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    document.title = "Converge — your shopping agent";
  }, []);

  if (isLoading)
    return (
      <div className="cv-app cv-connecting">
        <img src="/converge/brand/logo.svg" alt="" width={44} height={42} />
        <p role="status">Loading your account…</p>
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="cv-app">
        <AuthScreen />
      </div>
    );
  return <Workspace />;
}

function Workspace() {
  const { signOut } = useAuthActions();
  const requests = useQuery(api.buyer.listRequests, {});
  const profiles = useQuery(api.buyer.getProfiles, {});
  const saved = useQuery(api.buyer.listSaved, {});
  const initialRequest = new URLSearchParams(location.search).get("request");
  const [requestId, setRequestId] = useState<string | null>(initialRequest);
  const [view, setView] = useState<View>(initialRequest ? "flow" : "home");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [comparison, setComparison] = useState<ComparisonSelection>({ runId: null, ids: [] });
  const [compareOpen, setCompareOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [proscons, setProscons] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [sortChoice, setSortChoice] = useState<Sort | null>(null);
  const [now] = useState(Date.now);

  const draft = useQuery(api.buyer.getDraft, requestId ? { requestId } : "skip");
  const confirmed = useQuery(
    api.buyer.getConfirmedRequest,
    requestId ? { requestId } : "skip",
  );
  const activeRun = requests?.find((r) => r.requestId === requestId)?.activeRunId;
  const run = useQuery(
    api.buyer.getBuyerRun,
    requestId && activeRun ? { requestId } : "skip",
  );
  // The home screen suggests the offers from the most recent run that has any.
  const latest = requests?.find((r) => r.activeRunId);
  const latestRun = useQuery(
    api.buyer.getBuyerRun,
    view === "home" && latest ? { requestId: latest.requestId } : "skip",
  );
  const suggested: Suggested | null =
    latest && latestRun?.stage === "results" && latestRun.offers.length
      ? { requestId: latest.requestId, runId: latestRun.runId, cards: latestRun.offers }
      : null;
  const purchase = useQuery(api.buyer.getPurchase, requestId ? { requestId } : "skip");
  const orders = useQuery(api.buyer.listOrders, view === "orders" ? {} : "skip");

  const saveDraft = useAction(api.buyer.saveDraft),
    interpret = useAction(api.buyer.interpretDraft),
    confirm = useAction(api.buyer.confirmRequest),
    start = useAction(api.buyer.startRun),
    cancel = useAction(api.buyer.cancelRun),
    revise = useAction(api.buyer.reviseRequest),
    select = useAction(api.buyer.selectAndReserve),
    approve = useAction(api.buyer.approveAndExecute),
    setSort = useAction(api.buyer.setSort),
    bookmark = useAction(api.buyer.toggleSaved),
    removeSaved = useAction(api.buyer.removeSaved);

  const cards = run?.offers ?? [];
  const labels = requirementLabels(confirmed, profiles);
  const sort: Sort = sortChoice ?? confirmed?.sort ?? "best_fit";
  const savedIds = new Set((saved ?? []).map((s) => s.card.offer.id));
  const compared = comparisonIds(comparison, run?.runId ?? null);
  const locked =
    !!run && ["executing", "unknown", "complete"].includes(run.purchaseStage);
  const quoteUsable =
    !!purchase?.quote && ["reserved", "expired"].includes(purchase.quoteState ?? "");
  const execution = purchase?.execution ?? null;
  // Only an approval made in this page session auto-continues to Stripe. Coming back from
  // Stripe (or reloading) lands on the pending screen instead of bouncing straight out again.
  const redirectToStripe = useRef(false);
  const stripeUrl = execution?.status === "pending" ? (execution.checkoutUrl ?? null) : null;
  useEffect(() => {
    if (!stripeUrl || !redirectToStripe.current) return;
    redirectToStripe.current = false;
    const target = new URL(stripeUrl);
    if (target.protocol === "https:" && target.hostname === "checkout.stripe.com")
      window.location.assign(target.href);
  }, [stripeUrl]);
  const showCheckout =
    !!purchase?.quote &&
    (checkoutOpen ||
      (!!execution && ["succeeded", "pending", "unknown"].includes(execution.status)));

  const flash = (text: string, kind: "error" | "info" = "info") =>
    setToast({ kind, text });
  useEffect(() => {
    if (!toast) return;
    // errors linger longer so they can be read, but never stick around
    const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function setCompared(update: string[] | ((ids: string[]) => string[])) {
    setComparison((previous) => updateComparison(previous, run?.runId ?? null, update));
  }

  function openRequest(id: string | null, next: View = id ? "flow" : "home") {
    setRequestId(id);
    setView(next);
    setDetail(null);
    setCheckoutOpen(false);
    setProscons(false);
    setShowLog(false);
    setSortChoice(null);
    setQuery("");
    setToast(null);
    setComparison({ runId: null, ids: [] });
    history.replaceState(null, "", id ? `?request=${encodeURIComponent(id)}` : location.pathname);
  }

  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setToast(null);
    try {
      await fn();
    } catch (e) {
      flash(e instanceof Error ? e.message : "That didn’t work. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  /** `fresh` starts a brand-new request; otherwise the open draft continues. */
  async function submit(fresh: boolean, text?: string) {
    const body = (text ?? message).trim();
    if (!body) return;
    await perform(async () => {
      const next = contracts.DraftView.parse(
        unwrap(
          await saveDraft({
            input: {
              requestId: fresh ? null : requestId,
              expectedDraftVersion: fresh ? null : (draft?.draftVersion ?? null),
              message: body,
            },
          }),
        ),
      );
      if (fresh || next.requestId !== requestId) openRequest(next.requestId, "flow");
      setMessage("");
      unwrap(
        await interpret({
          input: { requestId: next.requestId, expectedDraftVersion: next.draftVersion },
        }),
      );
    });
  }

  const retryInterpret = () =>
    draft &&
    perform(async () => {
      unwrap(
        await interpret({
          input: { requestId: draft.requestId, expectedDraftVersion: draft.draftVersion },
        }),
      );
    });

  async function confirmBrief(input: Contract<"ConfirmRequestInput">) {
    await perform(async () => {
      const ref = contracts.Ref.parse(unwrap(await confirm({ input })));
      unwrap(await start({ input: { request: ref, clientKey: clientKey() } }));
    });
  }

  const restart = () =>
    run &&
    perform(async () => {
      unwrap(await start({ input: { request: run.request, clientKey: clientKey() } }));
      setComparison({ runId: null, ids: [] });
      setDetail(null);
    });

  const stop = () =>
    run &&
    perform(async () => {
      unwrap(await cancel({ input: { request: run.request, runId: run.runId } }));
    });

  /** Revising always sends the buyer back through brief confirmation. */
  async function revision(extra?: string) {
    if (!confirmed || !draft) return;
    await perform(async () => {
      const messages = extra
        ? [
            ...draft.messages,
            { id: `msg-${crypto.randomUUID()}`, role: "buyer" as const, text: extra, createdAt: Date.now() },
          ]
        : draft.messages;
      unwrap(
        await revise({
          input: {
            request: confirmed.request,
            changes: {
              messages,
              proposedLines: confirmed.brief.lines,
              proposedDeadline: confirmed.brief.deliveryDeadline,
              proposedPrivateMaximumCents: confirmed.privateMaximumCents,
              proposedSharedTargetCents: null,
              sort: confirmed.sort,
            },
          },
        }),
      );
      setMessage("");
      setDetail(null);
      setCheckoutOpen(false);
      setComparison({ runId: null, ids: [] });
      if (extra)
        unwrap(
          await interpret({
            input: { requestId: draft.requestId, expectedDraftVersion: draft.draftVersion + 1 },
          }),
        );
    });
  }

  const choose = (next: Sort) => {
    if (!run) return;
    setSortChoice(next);
    void perform(async () => {
      unwrap(await setSort({ input: { request: run.request, runId: run.runId, sort: next } }));
    });
  };

  const toggleSave = (card: OfferCard) =>
    requestId &&
    perform(async () => {
      unwrap(await bookmark({ input: { requestId, offer: card.offer } }));
    });

  const buy = (card: OfferCard) =>
    run &&
    perform(async () => {
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
      setCheckoutOpen(true);
    });

  const renew = () =>
    run &&
    purchase?.quote &&
    perform(async () => {
      unwrap(
        await select({
          input: {
            request: run.request,
            runId: run.runId,
            offer: purchase.quote!.offer,
            clientKey: clientKey(),
          },
        }),
      );
    });

  const placeOrder = () =>
    run &&
    purchase?.quote &&
    perform(async () => {
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
      // The Stripe session is created after approval, so the URL arrives through the
      // purchase query. Remember that *this* page started the payment (see effect below).
      redirectToStripe.current = true;
    });

  const openSaved = (s: SavedOffer) => {
    if (s.requestId && s.requestId !== requestId) openRequest(s.requestId, "flow");
    setView("flow");
    setDetail({
      card: s.card,
      index: 0,
      origin: s.requestId && s.runId ? { requestId: s.requestId, runId: s.runId } : null,
    });
  };

  const toggleCompare = (card: OfferCard) =>
    setCompared((ids) =>
      ids.includes(card.offer.id)
        ? ids.filter((id) => id !== card.offer.id)
        : ids.length < 3
          ? [...ids, card.offer.id]
          : ids,
    );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, detail, checkoutOpen, run?.stage, draft?.confirmedRequest]);

  /* ---------- which screen ---------- */
  const inProgress = !!run && running.includes(run.stage);
  const resultsReady = run?.stage === "results";
  const flowScreen: "home" | "loading" | "chat" | "starting" | "converging" | "offers" | "ended" =
    !requestId
      ? "home"
      : draft === undefined
        ? "loading"
        : !draft?.confirmedRequest
          ? "chat"
          : !run
            ? busy || activeRun
              ? "converging"
              : "starting"
            : inProgress
              ? "converging"
              : resultsReady
                ? "offers"
                : "ended";
  const deep = view === "flow" && (showCheckout || !!detail || flowScreen === "offers");
  const active: NavId | "saved" | "cart" | null =
    view === "saved"
      ? "saved"
      : view === "flow"
        ? deep
          ? showCheckout
            ? "cart"
            : "flow"
          : "home"
        : view;
  const showSearch =
    (view === "flow" && deep) || view === "compare" || view === "evidence";

  const comparedCards = cards.filter((c) => compared.includes(c.offer.id));
  const tableCards = comparedCards.length >= 2 ? comparedCards : cards;

  function body() {
    if (view === "home" || (view === "flow" && flowScreen === "home"))
      return (
        <Home
          greeting={greeting(now)}
          message={message}
          onMessage={setMessage}
          onSubmit={() => void submit(true)}
          busy={busy}
          requests={requests}
          saved={saved}
          suggested={suggested}
          onOpenRequest={(id) => openRequest(id, "flow")}
          onOpenSaved={openSaved}
          onOpenSuggested={(card, index, from) => {
            if (from.requestId !== requestId) openRequest(from.requestId, "flow");
            setView("flow");
            setDetail({
              card,
              index,
              origin: { requestId: from.requestId, runId: from.runId },
            });
          }}
        />
      );
    if (view === "saved")
      return (
        <SavedView
          saved={saved}
          busy={busy}
          onOpen={openSaved}
          onRemove={(s) =>
            void perform(async () => {
              unwrap(await removeSaved({ input: { bookmarkId: s.id } }));
            })
          }
        />
      );
    if (view === "orders")
      return <OrdersView orders={orders} onOpen={(id) => openRequest(id, "flow")} />;
    if (view === "evidence" || view === "compare") {
      if (!requestId || !run || !cards.length)
        return (
          <section className="cv-page">
            <h1>{view === "evidence" ? "Evidence" : "Direct comparison"}</h1>
            <p className="cv-empty-state">
              Start a search and your offers will appear here to {view === "evidence" ? "inspect" : "compare"}.
            </p>
            <button className="cv-primary" onClick={() => openRequest(null)}>
              Start a search
            </button>
          </section>
        );
      return view === "evidence" ? (
        <EvidenceView requestId={requestId} runId={run.runId} cards={cards} query={query} />
      ) : (
        <section className="cv-page is-wide" aria-labelledby="cv-compare-title">
          <h1 id="cv-compare-title">Direct comparison</h1>
          <p className="cv-page-sub">
            {comparedCards.length >= 2
              ? `Comparing the ${comparedCards.length} offers you picked.`
              : "Comparing every offer. Pick 2–3 with Compare on the offers screen to narrow this down."}
          </p>
          <CompareTable cards={tableCards.filter((c) => matches(c, query))} labels={labels} />
        </section>
      );
    }

    /* the shopping flow */
    if (flowScreen === "loading")
      return (
        <p className="cv-empty-state" role="status">
          Loading your request…
        </p>
      );
    if (!draft)
      return (
        <section className="cv-page">
          <h1>We couldn’t find that request</h1>
          <button className="cv-primary" onClick={() => openRequest(null)}>
            Start a new request
          </button>
        </section>
      );

    if (showCheckout && purchase)
      return quoteUsable || execution ? (
        <Checkout
          purchase={purchase}
          busy={busy}
          onBack={() => setCheckoutOpen(false)}
          onApprove={() => void placeOrder()}
          onRenew={() => void renew()}
          onChooseAnother={() => {
            setCheckoutOpen(false);
            setDetail(null);
          }}
          onOrders={() => setView("orders")}
          onNew={() => openRequest(null)}
        />
      ) : (
        <section className="cv-page">
          <h1>This reservation is no longer available</h1>
          <p className="cv-page-sub">Your hold ended or the stock was released. Pick an offer again.</p>
          <button
            className="cv-primary"
            onClick={() => {
              setCheckoutOpen(false);
              setDetail(null);
            }}
          >
            Back to offers
          </button>
        </section>
      );

    if (detail)
      return (
        <Product
          card={detail.card}
          index={detail.index}
          requestId={detail.origin?.requestId ?? null}
          runId={detail.origin?.runId ?? null}
          labels={labels}
          busy={busy}
          locked={locked}
          paymentMode={run?.modes.payment}
          onBack={() => setDetail(null)}
          onBuy={() => void buy(detail.card)}
        />
      );

    if (flowScreen === "chat")
      return (
        <Chat
          draft={draft}
          profiles={profiles}
          busy={busy}
          message={message}
          onMessage={setMessage}
          onSend={(text) => void submit(false, text)}
          onRetry={() => void retryInterpret()}
          onConfirm={confirmBrief}
        />
      );

    if (flowScreen === "starting")
      return (
        <section className="cv-ended">
          <h1>Your brief is confirmed</h1>
          <p>Start the comparison whenever you’re ready.</p>
          <button
            className="cv-primary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                unwrap(
                  await start({
                    input: { request: draft.confirmedRequest!, clientKey: clientKey() },
                  }),
                );
              })
            }
          >
            Start comparison
          </button>
        </section>
      );

    if (flowScreen === "converging")
      return (
        <>
          <Converging run={run} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
          <div className="cv-dock">
            <PromptBox
              value=""
              onChange={() => {}}
              onSubmit={() => {}}
              placeholder="Refine your search…"
              busy={busy}
              rows={2}
              label="Refine your search"
              shadow="soft"
              onStop={run?.allowedActions.includes("cancel") ? () => void stop() : undefined}
            />
          </div>
        </>
      );

    if (flowScreen === "offers")
      return (
        <>
          <Offers
            cards={cards}
            query={query}
            sort={sort}
            onSort={choose}
            comparedIds={compared}
            savedIds={savedIds}
            locked={locked || busy}
            proscons={proscons}
            labels={labels}
            onCompare={toggleCompare}
            onView={(card) =>
              setDetail({
                card,
                index: Math.max(0, cards.indexOf(card)),
                origin: requestId && run ? { requestId, runId: run.runId } : null,
              })
            }
            onSave={(card) => void toggleSave(card)}
          />
          <div className="cv-dock">
            <div className="cv-toolbar">
              <Chip disabled={busy || locked} onClick={() => void restart()}>
                Refresh offers
              </Chip>
              <Chip pressed={proscons} onClick={() => setProscons((v) => !v)}>
                {proscons ? "Hide pros and cons" : "Pros and cons"}
              </Chip>
              <Chip onClick={() => setCompareOpen(true)}>Direct comparison</Chip>
              <Chip disabled={busy || locked} onClick={() => void revision()}>
                Edit brief
              </Chip>
            </div>
            <PromptBox
              value={message}
              onChange={setMessage}
              onSubmit={() => void revision(message.trim())}
              placeholder="Refine your search…"
              busy={busy || locked}
              rows={2}
              label="Refine your search"
              shadow="soft"
            />
          </div>
        </>
      );

    return (
      <EndedState
        run={run!}
        busy={busy}
        onRevise={() => void revision()}
        onRetry={() => void restart()}
      />
    );
  }

  const screenKey = `${view}:${flowScreen}:${detail?.card.offer.id ?? ""}:${showCheckout}`;
  return (
    <div className="cv-app">
      <Navbar
        active={active}
        onNav={(id) => {
          if (id === "home") {
            setView("home");
            setDetail(null);
            setCheckoutOpen(false);
          } else if (id === "flow") {
            setView("flow");
            setDetail(null);
            setCheckoutOpen(false);
          } else setView(id);
          setQuery("");
        }}
        showSearch={showSearch}
        query={query}
        onQuery={setQuery}
        savedActive={view === "saved"}
        onSaved={() => setView("saved")}
        cartReady={quoteUsable}
        onCart={() => {
          if (quoteUsable) {
            setView("flow");
            setCheckoutOpen(true);
          } else flash("Pick an offer and press Buy now — your reserved offer will wait here.");
        }}
        onProfile={() => setSessionOpen(true)}
        disabled={{
          flow: !requestId,
          evidence: !cards.length,
          compare: !cards.length,
        }}
        rule={showCheckout || view === "orders" || view === "saved"}
      />
      <main className="cv-main" key={screenKey}>
        {body()}
      </main>
      {toast && (
        <div className={`cv-toast is-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      {compareOpen && (
        <Dialog title="Direct comparison" onClose={() => setCompareOpen(false)}>
          <CompareTable cards={tableCards} labels={labels} />
        </Dialog>
      )}
      {sessionOpen && (
        <Dialog title="Your account" onClose={() => setSessionOpen(false)}>
          <p className="cv-body-large">
            Your requests, approvals and orders are saved to your buyer account.
          </p>
          <p className="cv-footnote">
            Demo merchants with fictional inventory. Checkout runs in test mode, so no real
            money is charged.
          </p>
          <div className="cv-account-actions">
            <button
              className="cv-secondary"
              onClick={() => {
                history.replaceState(null, "", location.pathname);
                void signOut().catch(() => flash("Could not sign out. Please try again.", "error"));
              }}
            >
              Sign out
            </button>
          </div>
          <p className="cv-footnote">
            <a href="/classic">Open the classic workspace</a> ·{" "}
            <a href="/mock">Offline mock</a>
          </p>
        </Dialog>
      )}
    </div>
  );
}
