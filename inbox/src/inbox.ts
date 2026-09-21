import { parseNotice } from "./parse";
import { keyOf, merge } from "./dedupe";
import type { ItemStatus, PendingItem } from "./types";

/** The only thing each platform has to implement. */
export interface Store {
  get(id: string): Promise<PendingItem | null>;
  put(item: PendingItem): Promise<void>;
  list(status: ItemStatus): Promise<PendingItem[]>;
}

export interface Options {
  store: Store;
  /** Secret that anyone reading or writing has to send. */
  key: string;
  /** Origin allowed to read from the browser; "*" by default. */
  origin?: string;
  now?: () => Date;
}

/** Comparison that does not give itself away through timing. */
function keyMatches(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type Result =
  | { status: "read"; item: PendingItem; isNew: boolean }
  | { status: "ignored" };

export function createInbox({ store, key, origin = "*", now = () => new Date() }: Options) {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

  /**
   * Turns a notice into a pending item. Used both by the HTTP route and by
   * each platform's inbound email handler.
   */
  async function receive(text: string): Promise<Result> {
    const parsed = parseNotice(text);
    if (!parsed) return { status: "ignored" };
    const timestamp = now().toISOString();
    const existing = await store.get(keyOf(parsed.transaction));
    const item = merge(existing, parsed.transaction, { kind: parsed.kind, text, receivedAt: timestamp }, timestamp);
    await store.put(item);
    return { status: "read", item, isNew: !existing };
  }

  async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const sent = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!keyMatches(sent, key)) return json({ error: "bad key" }, 401);

    const path = new URL(req.url).pathname.replace(/\/+$/, "");

    if (req.method === "POST" && path.endsWith("/notice")) {
      const text = await req.text();
      if (!text.trim()) return json({ error: "empty notice" }, 400);
      return json(await receive(text));
    }

    if (req.method === "GET" && path.endsWith("/pending")) {
      return json({ pending: await store.list("pending") });
    }

    if (req.method === "POST" && path.endsWith("/status")) {
      const body = (await req.json().catch(() => null)) as { id?: string; status?: ItemStatus } | null;
      const status = body?.status;
      if (!body?.id || (status !== "saved" && status !== "discarded")) {
        return json({ error: "needs id and status saved or discarded" }, 400);
      }
      const item = await store.get(body.id);
      if (!item) return json({ error: "not found" }, 404);
      await store.put({ ...item, status, updatedAt: now().toISOString() });
      return json({ status });
    }

    return json({ error: "unknown route" }, 404);
  }

  return { handle, receive };
}
