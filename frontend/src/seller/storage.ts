// Inventory persistence. During `npm run dev` / `vite preview` the Vite server exposes
// /api/seller-inventory, backed by frontend/data/seller-inventory.json. Without that route
// (e.g. a static build) we fall back to this browser's localStorage.
import { initialInventory, parseInventory } from "./inventory.ts";
import type { InventoryState } from "./inventory.ts";

export type StorageMode = "file" | "browser";

const route = "/api/seller-inventory";
const browserKey = "buyerunion.seller.inventory.v1";
export const inventoryFilePath = "frontend/data/seller-inventory.json";

function loadFromBrowser(): InventoryState {
  try {
    const raw = localStorage.getItem(browserKey);
    return (raw && parseInventory(JSON.parse(raw))) || initialInventory();
  } catch {
    return initialInventory();
  }
}

function saveToBrowser(state: InventoryState) {
  try {
    localStorage.setItem(browserKey, JSON.stringify(state));
  } catch {
    // Quota or privacy mode: in-memory state still works for this session.
  }
}

export async function loadInventory(): Promise<{ state: InventoryState; mode: StorageMode; seeded: boolean }> {
  try {
    const res = await fetch(route, { cache: "no-store" });
    if (res.status === 404 && res.headers.get("content-type")?.includes("application/json")) {
      return { state: initialInventory(), mode: "file", seeded: true };
    }
    if (res.ok) {
      const state = parseInventory(await res.json());
      if (state) return { state, mode: "file", seeded: false };
      // A hand-edited file that no longer validates is left untouched; work from the browser copy.
      console.warn(`${inventoryFilePath} is not a valid inventory; using browser storage instead.`);
    }
  } catch {
    // No dev server route; fall through.
  }
  return { state: loadFromBrowser(), mode: "browser", seeded: false };
}

let queue: Promise<unknown> = Promise.resolve();

// Saves are chained so an older snapshot can never land after a newer one.
export function saveInventory(state: InventoryState, mode: StorageMode): Promise<boolean> {
  if (mode === "browser") {
    saveToBrowser(state);
    return Promise.resolve(true);
  }
  const next = queue.then(async () => {
    try {
      const res = await fetch(route, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    } catch {
      saveToBrowser(state);
      return false;
    }
  });
  queue = next;
  return next;
}
