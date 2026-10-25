import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";

/* ---------- icons ---------- */
type IconProps = { size?: number; filled?: boolean; className?: string };
const Svg = ({
  size = 18,
  filled,
  className,
  children,
}: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M12 5v14" />
  </Svg>
);
export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const ArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7h10v10M7 17 17 7" />
  </Svg>
);
export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </Svg>
);
export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </Svg>
);

const asset = (name: string) => `/converge/icons/${name}.svg`;

/* ---------- navbar ---------- */
export type NavId = "home" | "flow" | "evidence" | "compare" | "orders";
const links: { id: NavId; label: string }[] = [
  { id: "home", label: "Shop Now" },
  { id: "flow", label: "Offers" },
  { id: "evidence", label: "Evidence" },
  { id: "compare", label: "Compare" },
  { id: "orders", label: "Orders" },
];

export function Navbar({
  active,
  onNav,
  showSearch,
  query,
  onQuery,
  savedActive,
  onSaved,
  cartReady,
  onCart,
  onProfile,
  disabled,
  rule,
}: {
  active: NavId | "saved" | "cart" | null;
  onNav: (id: NavId) => void;
  showSearch: boolean;
  query: string;
  onQuery: (value: string) => void;
  savedActive: boolean;
  onSaved: () => void;
  cartReady: boolean;
  onCart: () => void;
  onProfile: () => void;
  disabled: Partial<Record<NavId, boolean>>;
  rule: boolean;
}) {
  return (
    <header className={`cv-nav ${rule ? "has-rule" : ""}`}>
      <button
        className="cv-brand"
        onClick={() => onNav("home")}
        aria-label="Converge home"
      >
        <img src="/converge/brand/logo.svg" alt="" width={30} height={28} />
        <span>Converge</span>
      </button>
      <nav className="cv-links" aria-label="Primary">
        {links.map((link) => (
          <button
            key={link.id}
            className={`cv-link ${active === link.id ? "is-active" : ""}`}
            aria-current={active === link.id ? "page" : undefined}
            disabled={disabled[link.id]}
            onClick={() => onNav(link.id)}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <span className="cv-spacer" />
      {showSearch && (
        <label className="cv-search">
          <img src={asset("search")} alt="" width={18} height={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search bundles, offers, or evidence"
            aria-label="Search offers and evidence"
          />
        </label>
      )}
      <div className="cv-actions">
        <button className="cv-action" aria-label="Your session" onClick={onProfile}>
          <img src={asset("user")} alt="" width={20} height={20} />
        </button>
        <button
          className={`cv-action ${savedActive ? "is-active" : ""}`}
          aria-label="Saved offers"
          onClick={onSaved}
        >
          <img src={asset("heart")} alt="" width={20} height={20} />
        </button>
        <button
          className={`cv-action ${active === "cart" ? "is-active" : ""}`}
          aria-label={
            cartReady ? "Open your reserved offer" : "No reserved offer yet"
          }
          onClick={onCart}
        >
          <img src={asset("cart")} alt="" width={20} height={20} />
          {cartReady && <i className="cv-badge" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

/* ---------- prompt box with dictation ---------- */
type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
interface SpeechLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechLike;
const speechCtor = (): SpeechCtor | null => {
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function PromptBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  busy,
  onStop,
  rows = 3,
  label = "Describe what you need",
  autoFocus,
  shadow = "input",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** true while a request is being saved */
  busy: boolean;
  /** when set, the send button turns into a stop button */
  onStop?: () => void;
  rows?: number;
  label?: string;
  autoFocus?: boolean;
  shadow?: "input" | "soft";
}) {
  const [canDictate] = useState(() => speechCtor() !== null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechLike | null>(null);
  const base = useRef("");

  useEffect(() => () => recognition.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    base.current = value ? `${value.trimEnd()} ` : "";
    rec.onresult = (event) => {
      const heard = Array.from(event.results, (r) => r[0].transcript).join("");
      onChange(`${base.current}${heard}`.slice(0, 4000));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (onStop || busy || !value.trim()) return;
    recognition.current?.stop();
    onSubmit();
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const stopping = Boolean(onStop);
  return (
    <form
      className={`cv-prompt shadow-${shadow}`}
      onSubmit={submit}
      aria-label={label}
    >
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        maxLength={4000}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="cv-prompt-tools">
        <button
          type={stopping ? "button" : "submit"}
          className={`cv-send ${stopping ? "is-stop" : ""}`}
          disabled={!stopping && (busy || !value.trim())}
          onClick={stopping ? onStop : undefined}
          aria-label={stopping ? "Stop" : "Send"}
        >
          <img
            src={asset(stopping ? "stop" : "send")}
            alt=""
            width={16}
            height={16}
          />
        </button>
        {canDictate && (
          <button
            type="button"
            className={`cv-mic ${listening ? "is-listening" : ""}`}
            onClick={toggleDictation}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictation" : "Dictate your request"}
          >
            <img src={asset("mic")} alt="" width={18} height={18} />
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------- small shared pieces ---------- */
export function Chip({
  children,
  onClick,
  disabled,
  pressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="cv-chip"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

export function Mascot({ variant = "a" }: { variant?: "a" | "b" }) {
  return (
    <img
      className="cv-mascot"
      src={`/converge/brand/mascot${variant === "b" ? "-b" : ""}.svg`}
      alt=""
      width={53}
      height={50}
    />
  );
}

export function Dialog({
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
      className="cv-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="cv-dialog-title"
    >
      <div className="cv-dialog-head">
        <h2 id="cv-dialog-title">{title}</h2>
        <button className="cv-action" onClick={onClose} aria-label="Close dialog">
          <CrossIcon size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
