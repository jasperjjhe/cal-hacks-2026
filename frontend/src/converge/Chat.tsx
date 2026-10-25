import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { contracts } from "../contracts";
import type { Contract } from "../contracts";
import { Chip, CrossIcon, Mascot, PlusIcon, PromptBox } from "./ui";
import { dateInput, endOfDay, label as pretty } from "./format";

type Draft = Contract<"DraftView">;
type Profile = Contract<"CategoryProfile">;
type Line = Contract<"RequestLine">;
type Requirement = Contract<"Requirement">;

const operatorWords: Record<Requirement["operator"], string> = {
  equals: "is",
  in: "any of",
  min: "at least",
  max: "at most",
  containsAll: "includes",
};

function describe(requirement: Requirement, profile: Profile | undefined) {
  const field = profile?.fields.find((f) => f.id === requirement.fieldId);
  const value = Array.isArray(requirement.value)
    ? requirement.value.join(", ")
    : typeof requirement.value === "boolean"
      ? requirement.value
        ? "yes"
        : "no"
      : String(requirement.value);
  return {
    name: field?.label ?? pretty(requirement.fieldId),
    rule: operatorWords[requirement.operator],
    value: `${value}${requirement.unit ? ` ${requirement.unit}` : ""}`,
  };
}

/**
 * The live agent can take about a minute, so waiting is staged: dots first, a
 * patient note after 12s, and a retry only once it is genuinely overdue
 * (retrying is safe: the backend reuses the job already in flight).
 */
function PendingNote({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const [stage, setStage] = useState<"quick" | "slow" | "stalled">("quick");
  useEffect(() => {
    const slow = setTimeout(() => setStage("slow"), 12000);
    const stalled = setTimeout(() => setStage("stalled"), 100000);
    return () => {
      clearTimeout(slow);
      clearTimeout(stalled);
    };
  }, []);
  return (
    <div className="cv-row is-assistant" aria-live="polite">
      <Mascot />
      <div className="cv-bubble is-typing" role="status">
        {stage === "stalled" ? (
          <span>
            This is taking longer than usual.{" "}
            <button className="cv-linkish" disabled={busy} onClick={onRetry}>
              Try again
            </button>
          </span>
        ) : stage === "slow" ? (
          <span>Still thinking. Your buyer agent can take up to a minute…</span>
        ) : (
          <>
            <span className="cv-sr">Your buyer agent is reading your request</span>
            <i />
            <i />
            <i />
          </>
        )}
      </div>
    </div>
  );
}

function BriefCard({
  draft,
  profiles,
  busy,
  onConfirm,
}: {
  draft: Draft;
  profiles: Profile[];
  busy: boolean;
  onConfirm: (input: Contract<"ConfirmRequestInput">) => Promise<void>;
}) {
  const proposed = draft.interpretation!;
  const [today] = useState(() => dateInput(Date.now()));
  const [lines, setLines] = useState<Line[]>(() => proposed.proposedLines ?? []);
  const [maximum, setMaximum] = useState(
    proposed.proposedPrivateMaximumCents
      ? String(proposed.proposedPrivateMaximumCents / 100)
      : "",
  );
  const [deadline, setDeadline] = useState(
    proposed.proposedDeadline ? dateInput(proposed.proposedDeadline) : "",
  );
  const [share, setShare] = useState(false);
  const [target, setTarget] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  const touch = (fn: () => void) => {
    fn();
    setChecked(false);
  };
  const patch = (index: number, change: Partial<Line>) =>
    touch(() =>
      setLines((prev) =>
        prev.map((l, i) => (i === index ? { ...l, ...change } : l)),
      ),
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!checked) throw new Error("Confirm you reviewed the brief first.");
      const input = contracts.ConfirmRequestInput.parse({
        requestId: draft.requestId,
        expectedDraftVersion: draft.draftVersion,
        lines,
        deliveryDeadline: endOfDay(deadline),
        privateMaximumCents: Math.round(Number(maximum) * 100),
        sharedTargetCents: share ? Math.round(Number(target) * 100) : null,
        shareTarget: share,
        sort: "best_fit",
      });
      await onConfirm(input);
    } catch (err) {
      setError(
        err instanceof Error && err.name !== "ZodError"
          ? err.message
          : "Check the maximum price, arrival date and any shared target.",
      );
    }
  }

  const missing = [
    !maximum && "your maximum price",
    !deadline && "an arrival date",
  ].filter(Boolean) as string[];

  return (
    <form className="cv-brief" onSubmit={submit} aria-label="Review your brief">
      <div className="cv-brief-head">
        <h2>Here’s what I’ll look for</h2>
        <span className="cv-pill">Confirm to start</span>
      </div>
      <p className="cv-brief-note">
        Sellers only see the product details below. Your conversation and your
        maximum price stay private.
      </p>

      {lines.map((line, index) => {
        const profile = profiles.find(
          (p) =>
            p.profile.id === line.profile.id &&
            p.profile.version === line.profile.version,
        );
        return (
          <fieldset className="cv-item" key={line.lineId}>
            <legend>
              {index === 0 ? "Main item" : `Related item ${index}`} ·{" "}
              {pretty(line.category)}
            </legend>
            <div className="cv-item-controls">
              <div className="cv-stepper" role="group" aria-label="Quantity">
                <button
                  type="button"
                  aria-label="Fewer"
                  disabled={line.quantity <= 1}
                  onClick={() => patch(index, { quantity: line.quantity - 1 })}
                >
                  −
                </button>
                <output aria-live="polite">{line.quantity}</output>
                <button
                  type="button"
                  aria-label="More"
                  disabled={line.quantity >= 10}
                  onClick={() => patch(index, { quantity: line.quantity + 1 })}
                >
                  <PlusIcon size={14} />
                </button>
              </div>
              <div className="cv-toggles" role="group" aria-label="Condition">
                {(profile?.allowedConditions ?? line.allowedConditions).map(
                  (condition) => {
                    const on = line.allowedConditions.includes(condition);
                    return (
                      <button
                        type="button"
                        key={condition}
                        className="cv-toggle"
                        aria-pressed={on}
                        disabled={on && line.allowedConditions.length === 1}
                        onClick={() =>
                          patch(index, {
                            allowedConditions: on
                              ? line.allowedConditions.filter(
                                  (c) => c !== condition,
                                )
                              : [...line.allowedConditions, condition],
                          })
                        }
                      >
                        {condition}
                      </button>
                    );
                  },
                )}
              </div>
              {index > 0 && (
                <button
                  type="button"
                  className="cv-linkish"
                  onClick={() =>
                    touch(() =>
                      setLines((prev) => prev.filter((_, i) => i !== index)),
                    )
                  }
                >
                  Remove item
                </button>
              )}
            </div>
            {line.requirements.length ? (
              <ul className="cv-reqs">
                {line.requirements.map((r) => {
                  const d = describe(r, profile);
                  return (
                    <li key={r.id} className={r.strength === "hard" ? "is-hard" : ""}>
                      <span className="cv-req-kind">
                        {r.strength === "hard" ? "Must have" : "Nice to have"}
                      </span>
                      <span>
                        <strong>{d.name}</strong> {d.rule} {d.value}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${d.name}`}
                        onClick={() =>
                          patch(index, {
                            requirements: line.requirements.filter(
                              (x) => x.id !== r.id,
                            ),
                          })
                        }
                      >
                        <CrossIcon size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cv-brief-note">
                No specific requirements yet. Tell me more in the chat to
                narrow it down.
              </p>
            )}
          </fieldset>
        );
      })}

      <div className="cv-fields">
        <label>
          <span>Your maximum, delivered (private)</span>
          <div className="cv-money">
            <i>$</i>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={maximum}
              placeholder="0.00"
              required
              onChange={(e) => touch(() => setMaximum(e.target.value))}
            />
          </div>
        </label>
        <label>
          <span>Arrive by (San Francisco)</span>
          <input
            type="date"
            value={deadline}
            min={today}
            required
            onChange={(e) => touch(() => setDeadline(e.target.value))}
          />
        </label>
      </div>

      <label className="cv-check">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) =>
            touch(() => {
              setShare(e.target.checked);
              setTarget("");
            })
          }
        />
        <span>
          Share a target price with sellers (optional). I understand sellers
          will see this number.
        </span>
      </label>
      {share && (
        <label className="cv-fields-single">
          <span>Target delivered price</span>
          <div className="cv-money">
            <i>$</i>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={maximum || undefined}
              value={target}
              required
              onChange={(e) => touch(() => setTarget(e.target.value))}
            />
          </div>
        </label>
      )}

      <label className="cv-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          I reviewed the items, quantities, conditions, arrival date and price
          limits.
        </span>
      </label>

      {error && (
        <p className="cv-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="cv-brief-actions">
        <button
          className="cv-primary"
          disabled={busy || !lines.length || !checked}
        >
          {busy ? "Starting…" : "Find offers"}
        </button>
        {missing.length > 0 && (
          <span className="cv-brief-note">Still needed: {missing.join(" and ")}.</span>
        )}
      </div>
    </form>
  );
}

export function Chat({
  draft,
  profiles,
  busy,
  message,
  onMessage,
  onSend,
  onRetry,
  onConfirm,
}: {
  draft: Draft;
  profiles: Profile[] | undefined;
  busy: boolean;
  message: string;
  onMessage: (value: string) => void;
  onSend: (text?: string) => void;
  onRetry: () => void;
  onConfirm: (input: Contract<"ConfirmRequestInput">) => Promise<void>;
}) {
  const end = useRef<HTMLDivElement>(null);
  const last = draft.messages[draft.messages.length - 1];
  const waiting = !draft.interpretation && last?.role === "buyer";
  const lastAssistant = draft.messages.findLast((m) => m.role === "assistant");
  const replies = draft.interpretation?.suggestedReplies ?? [];
  const showBrief = !!draft.interpretation?.proposedLines?.length && !!profiles;

  useEffect(() => {
    end.current?.scrollIntoView({
      block: "end",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [draft.messages.length, waiting, showBrief]);

  return (
    <section className="cv-chat" aria-label="Conversation with your buyer agent">
      <div className="cv-thread">
        {draft.messages.map((m) => (
          <div key={m.id} className={`cv-row is-${m.role}`}>
            {m.role === "assistant" && <Mascot />}
            <div className="cv-bubble">{m.text}</div>
            {m.role === "assistant" &&
              m.id === lastAssistant?.id &&
              replies.length > 0 && (
                <div className="cv-replies" role="group" aria-label="Suggested replies">
                  {replies.map((reply) => (
                    <Chip
                      key={reply.id}
                      disabled={busy}
                      onClick={() => onSend(reply.text)}
                    >
                      {reply.label}
                    </Chip>
                  ))}
                </div>
              )}
          </div>
        ))}
        {waiting && <PendingNote onRetry={onRetry} busy={busy} />}
        {showBrief && (
          <div className="cv-row is-assistant has-card">
            <Mascot />
            <BriefCard
              key={`${draft.requestId}:${draft.draftVersion}:${draft.updatedAt}`}
              draft={draft}
              profiles={profiles}
              busy={busy}
              onConfirm={onConfirm}
            />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="cv-chat-dock">
        <PromptBox
          value={message}
          onChange={onMessage}
          onSubmit={() => onSend()}
          placeholder="Add a detail or answer the question…"
          busy={busy}
          rows={2}
          label="Add to your request"
          shadow="soft"
        />
      </div>
    </section>
  );
}
