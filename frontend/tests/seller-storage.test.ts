import { afterEach, describe, expect, it, vi } from "vitest";
import { initialInventory, withActivity } from "../src/seller/inventory.ts";
import { loadInventory, saveInventory } from "../src/seller/storage.ts";

function stubStorage({ broken = false } = {}) {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (broken) throw new DOMException("full", "QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key: string) => items.delete(key),
  });
}

// A dev-server stand-in whose file can be read but optionally not written.
function stubServer(file: unknown, { writable }: { writable: boolean }) {
  let current = JSON.stringify(file);
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      if (!writable) return new Response('{"error":"could not save inventory"}', { status: 400 });
      current = String(init.body);
      return new Response('{"ok":true}');
    }
    return new Response(current, { headers: { "Content-Type": "application/json" } });
  });
}

describe("seller inventory storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recovers the browser copy after a failed file save, then clears it once the file catches up", async () => {
    stubStorage();
    const original = withActivity(initialInventory(), "seeded");
    stubServer(original, { writable: false });
    const edited = { ...withActivity(original, "edited"), savedAt: (original.savedAt ?? 0) + 1 };
    expect(await saveInventory(edited, "file")).toBe("backup");

    const reloaded = await loadInventory();
    expect(reloaded).toMatchObject({ mode: "file", needsSave: true });
    expect(reloaded.state).toEqual(edited);

    stubServer(original, { writable: true });
    expect(await saveInventory(reloaded.state, "file")).toBe("saved");
    stubServer(original, { writable: true });
    expect((await loadInventory()).needsSave).toBe(false);
  });

  it("reports unsaved instead of success when browser storage fails", async () => {
    stubStorage({ broken: true });
    const state = withActivity(initialInventory(), "edited");
    expect(await saveInventory(state, "browser")).toBe("unsaved");
    stubServer(state, { writable: false });
    expect(await saveInventory(state, "file")).toBe("unsaved");
  });
});
