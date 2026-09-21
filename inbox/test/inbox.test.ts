import { beforeEach, describe, expect, it } from "vitest";
import { createInbox, type Store } from "../src/inbox";
import type { ItemStatus, PendingItem } from "../src/types";

const LULO_SMS =
  "Lulo Bank: Compra realizada por $37,500 en PANADERIA LA ESPIGA con tu tarjeta terminada en *1234. " +
  "Fecha 4 de marzo de 2026. Hora 8:12 a.m.";
const LULO_EMAIL = `Realizaste una compra en PANADERIA LA ESPIGA por $37,500
Origen tarjeta de crédito •1234
Fecha 4 de marzo de 2026
Hora 8:12 a.m.`;
const KEY = "a-long-test-key";

function memoryStore(): Store & { all: Map<string, PendingItem> } {
  const all = new Map<string, PendingItem>();
  return {
    all,
    async get(id) { return all.get(id) ?? null; },
    async put(item) { all.set(item.id, item); },
    async list(status: ItemStatus) { return [...all.values()].filter((i) => i.status === status); },
  };
}

describe("inbox", () => {
  let store: ReturnType<typeof memoryStore>;
  let inbox: ReturnType<typeof createInbox>;
  const call = (path: string, init?: RequestInit, key = KEY) =>
    inbox.handle(new Request(`https://inbox.example.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
    }));

  beforeEach(() => {
    store = memoryStore();
    inbox = createInbox({ store, key: KEY, origin: "https://gustperz.github.io" });
  });

  it("answers the browser preflight with the origin permissions", async () => {
    const res = await inbox.handle(new Request("https://inbox.example.com/pending", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://gustperz.github.io");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("turns nobody away with the wrong key", async () => {
    expect((await call("/pending", {}, "wrong")).status).toBe(401);
    expect((await call("/pending", {}, "")).status).toBe(401);
  });

  it("turns a notice into a pending item and lists it", async () => {
    const res = await call("/notice", { method: "POST", body: LULO_SMS });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "read", isNew: true });

    const list = await (await call("/pending")).json();
    expect(list.pending).toHaveLength(1);
    expect(list.pending[0]).toMatchObject({ amount: 37500, merchant: "Panaderia La Espiga", last4: "1234" });
  });

  it("joins the email and the text message of one purchase into a single item", async () => {
    await call("/notice", { method: "POST", body: LULO_SMS });
    const second = await (await call("/notice", { method: "POST", body: LULO_EMAIL })).json();
    expect(second).toMatchObject({ status: "read", isNew: false });

    const list = await (await call("/pending")).json();
    expect(list.pending).toHaveLength(1);
    expect(list.pending[0].notices).toHaveLength(2);
    expect(list.pending[0].credit).toBe(true);
  });

  it("ignores messages that are not purchases", async () => {
    const res = await call("/notice", { method: "POST", body: "Ingresa la clave 2492 para ver los datos de tu tarjeta." });
    expect(await res.json()).toEqual({ status: "ignored" });
    expect(store.all.size).toBe(0);
  });

  it("drops from the list whatever was already saved", async () => {
    const { item } = await (await call("/notice", { method: "POST", body: LULO_SMS })).json();
    const res = await call("/status", { method: "POST", body: JSON.stringify({ id: item.id, status: "saved" }) });
    expect(res.status).toBe(200);
    expect((await (await call("/pending")).json()).pending).toHaveLength(0);
  });

  it("does not let a late notice revive something already saved", async () => {
    const { item } = await (await call("/notice", { method: "POST", body: LULO_SMS })).json();
    await call("/status", { method: "POST", body: JSON.stringify({ id: item.id, status: "saved" }) });
    await call("/notice", { method: "POST", body: LULO_EMAIL });
    expect((await (await call("/pending")).json()).pending).toHaveLength(0);
  });

  it("rejects what it does not understand", async () => {
    expect((await call("/notice", { method: "POST", body: "   " })).status).toBe(400);
    expect((await call("/status", { method: "POST", body: JSON.stringify({ id: "x" }) })).status).toBe(400);
    expect((await call("/status", { method: "POST", body: JSON.stringify({ id: "x", status: "saved" }) })).status).toBe(404);
    expect((await call("/somewhere-else")).status).toBe(404);
  });
});
