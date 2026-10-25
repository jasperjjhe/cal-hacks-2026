import { useState } from "react";
import type { FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

/** Email + password accounts: requests, approvals and orders belong to the account. */
export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = flow === "signUp";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await signIn("password", data);
    } catch {
      setError(
        creating
          ? "Could not create that account. If you already have one, try signing in."
          : "Could not sign in. Check your email and password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cv-auth">
      <form className="cv-auth-card" onSubmit={submit} aria-labelledby="cv-auth-title">
        <img src="/converge/brand/logo.svg" alt="" width={44} height={42} />
        <h1 id="cv-auth-title">{creating ? "Create your account" : "Welcome back"}</h1>
        <p className="cv-auth-sub">
          {creating
            ? "Your requests, approvals and orders are saved to your account."
            : "Sign in to pick up your requests and orders."}
        </p>
        <input type="hidden" name="flow" value={flow} />
        <label className="cv-auth-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            autoFocus
          />
        </label>
        <label className="cv-auth-field">
          <span>Password{creating && " (8+ characters)"}</span>
          <input
            name="password"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            minLength={8}
            maxLength={256}
            required
          />
        </label>
        {error && (
          <p className="cv-form-error" role="alert">
            {error}
          </p>
        )}
        <button className="cv-primary wide" disabled={busy}>
          {busy ? "Connecting…" : creating ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="cv-linkish"
          disabled={busy}
          onClick={() => {
            setFlow(creating ? "signIn" : "signUp");
            setError("");
          }}
        >
          {creating ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <p className="cv-footnote">
          Demo merchants with fictional inventory. Payments run in test mode.
        </p>
      </form>
    </main>
  );
}
