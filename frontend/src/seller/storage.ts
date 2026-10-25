// Inventory persistence. During `npm run dev` / `vite preview` the Vite server exposes
// /api/seller-inventory, backed by frontend/data/seller-inventory.json. Without that route
// (e.g. a static build) we fall back to this browser's localStorage.
import { initialInventory, parseInventory } from "./inventory.ts";
import type { InventoryState } from "./inventory.ts";

export type StorageMode = "file" | "browser";
// "backup": the file write failed but this browser holds the copy; "unsaved": nothing durable has it.
export type SaveResult = "saved" | "backup" | "unsaved";

const route = "/api/seller-inventory";
const browserKey = "buyerunion.seller.inventory.v1";
// Set when the browser copy is newer than the file (a file save failed); holds that copy's savedAt.
const unsyncedKey = "buyerunion.seller.inventory.unsynced.v1";
export const inventoryFilePath = "frontend/data/seller-inventory.json";

function readBrowser(): InventoryState | null {
  try {
    const raw = localStorage.getItem(browserKey);
    return raw ? parseInventory(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveToBrowser(state: InventoryState): boolean {
  try {
    localStorage.setItem(browserKey, JSON.stringify(state));
    return true;
  } catch {
    // Quota or privacy mode: the caller reports the edit as unsaved.
    return false;
  }
}

function unsyncedRevision(): number | null {
  try {
    const raw = localStorage.getItem(unsyncedKey);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function setUnsynced(revision: number | null): boolean {
  try {
    if (revision === null) localStorage.removeItem(unsyncedKey);
    else localStorage.setItem(unsyncedKey, String(revision));
    return true;
  } catch {
    return false;
  }
}

// A browser copy left behind by a failed file save, if it's still at least as new as the file.
function recoverUnsynced(file: InventoryState | null): InventoryState | null {
  if (unsyncedRevision() === null) return null;
  const copy = readBrowser();
  if (copy && (copy.savedAt ?? 0) >= (file?.savedAt ?? 0)) return copy;
  setUnsynced(null);
  return null;
}

// needsSave: the state isn't in the file yet (first run, or a recovered browser copy) and should be written.
export async function loadInventory(): Promise<{ state: InventoryState; mode: StorageMode; needsSave: boolean }> {
  try {
    const res = await fetch(route, { cache: "no-store" });
    if (res.status === 404 && res.headers.get("content-type")?.includes("application/json")) {
      return { state: recoverUnsynced(null) ?? initialInventory(), mode: "file", needsSave: true };
    }
    if (res.ok) {
      const state = parseInventory(await res.json());
      if (state) {
        const recovered = recoverUnsynced(state);
        return recovered ? { state: recovered, mode: "file", needsSave: true } : { state, mode: "file", needsSave: false };
      }
      // A hand-edited file that no longer validates is left untouched; work from the browser copy.
      console.warn(`${inventoryFilePath} is not a valid inventory; using browser storage instead.`);
    }
  } catch {
    // No dev server route; fall through.
  }
  return { state: readBrowser() ?? initialInventory(), mode: "browser", needsSave: false };
}

let queue: Promise<unknown> = Promise.resolve();

// Saves are chained so an older snapshot can never land after a newer one.
export function saveInventory(state: InventoryState, mode: StorageMode): Promise<SaveResult> {
  if (mode === "browser") {
    return Promise.resolve(saveToBrowser(state) ? "saved" : "unsaved");
  }
  const next = queue.then(async (): Promise<SaveResult> => {
    try {
      const res = await fetch(route, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Only drop the recovery marker once the file has this revision or a newer one.
      const pending = unsyncedRevision();
      if (pending !== null && pending <= (state.savedAt ?? 0)) setUnsynced(null);
      return "saved";
    } catch {
      // Without the marker the copy wouldn't be recovered on reload, so it isn't a real backup.
      return saveToBrowser(state) && setUnsynced(state.savedAt ?? 0) ? "backup" : "unsaved";
    }
  });
  queue = next;
  return next;
}
