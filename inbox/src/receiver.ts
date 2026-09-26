import { keyOf } from "./dedupe";
import { parseNotice } from "./parse";

/** Where the mailbox delivers: the project's public settings plus the mailbox key. */
export interface Destination {
  /** Supabase project URL. */
  url: string;
  /** Publishable key: public, only identifies the project. */
  key: string;
  /** Mailbox key created in Contame. Secret: keep it in an environment variable. */
  token: string;
}

export type Delivery =
  /** A purchase: 'new', or joined to one already in the inbox. */
  | { status: "new" | "merged" | "known"; merchant: string; amount: number }
  /** Not a purchase notice; kept so it can be seen from the app. */
  | { status: "unmatched" };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function rpc(to: Destination, name: string, args: Record<string, unknown>, fetchFn: Fetch): Promise<unknown> {
  const res = await fetchFn(`${to.url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: to.key, Authorization: `Bearer ${to.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (!res.ok) {
    let message = body;
    try {
      message = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {
      // Not JSON: keep the raw text.
    }
    throw new Error(`Supabase respondió ${res.status}: ${message}`);
  }
  return body ? JSON.parse(body) : null;
}

/**
 * Reads a message and hands it to the person's inbox: as a purchase when it
 * matches a bank template, as an unreadable message otherwise.
 */
export async function deliver(
  message: { text: string; sender?: string; subject?: string },
  to: Destination,
  fetchFn: Fetch = fetch,
): Promise<Delivery> {
  const parsed = parseNotice(message.text);
  if (!parsed) {
    await rpc(to, "receive_unmatched", { p_token: to.token, p_sender: message.sender ?? null, p_subject: message.subject ?? null, p_body: message.text }, fetchFn);
    return { status: "unmatched" };
  }
  const t = parsed.transaction;
  const status = (await rpc(
    to,
    "receive_notice",
    { p_token: to.token, p_item: { id: keyOf(t), ...t, notice: { kind: parsed.kind, text: message.text.slice(0, 4000) } } },
    fetchFn,
  )) as "new" | "merged" | "known";
  return { status, merchant: t.merchant, amount: t.amount };
}
