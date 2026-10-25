export type Role = "buyer" | "seller";

const storageKey = "buyerunion.role.v1";

function isRole(value: unknown): value is Role {
  return value === "buyer" || value === "seller";
}

// View preference only. Server-side authorization still decides what each session may read or write.
export function initialRole(): Role {
  const fromUrl = new URLSearchParams(location.search).get("role");
  if (isRole(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(storageKey);
    if (isRole(stored)) return stored;
  } catch {
    // Storage can be unavailable in private browsing; fall through to the default.
  }
  return "buyer";
}

export function persistRole(role: Role) {
  const url = new URL(location.href);
  if (role === "buyer") url.searchParams.delete("role");
  else url.searchParams.set("role", role);
  history.replaceState(history.state, "", url);
  try {
    localStorage.setItem(storageKey, role);
  } catch {
    // Non-fatal: the URL still carries the choice.
  }
}
