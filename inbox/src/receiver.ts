import { keyOf } from "./dedupe";
import { htmlToText, type IncomingEmail } from "./email";
import { readNotice, type NoticeReading } from "./parse";

/** Where the mailbox delivers: the project's public settings plus the mailbox key. */
export interface Destination {
  /** Supabase project URL. */
  url: string;
  /** Publishable key: public, only identifies the project. */
  key: string;
  /** Mailbox key created in Contame. */
  token: string;
}

export type Delivery =
  /** A purchase: 'new', or joined to one already in the inbox. */
  | { status: "new" | "merged" | "known"; merchant: string; amount: number }
  /** Not a purchase notice; kept so it can be seen from the app. */
  | { status: "unmatched" }
  /** Known not to be spending (money received, a declined payment): nothing is sent. */
  | { status: "ignored" };

/** One call to make on the database, ready for whichever HTTP client the platform has. */
export interface PreparedDelivery {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** What to report once the call succeeds, given its response. */
  outcome: (response: unknown) => Delivery;
}

/**
 * An email read as a notice: the first of its plain and HTML versions that a
 * bank template recognises, or the most readable one when none does.
 */
export function readEmail(email: IncomingEmail): { text: string; reading: NoticeReading } {
  const candidates = [email.text?.trim() ?? "", email.html ? htmlToText(email.html) : ""].filter(Boolean);
  const ctx = { subject: email.subject, receivedAt: email.receivedAt };
  for (const text of candidates) {
    const reading = readNotice(text, ctx);
    if (reading.status !== "unknown") return { text, reading };
  }
  return { text: candidates[0] ?? "", reading: readNotice("", ctx) };
}

/**
 * The database call for an email: a purchase for the inbox, or an unreadable
 * message. Null when the email is known not to be spending and nothing is sent.
 */
export function prepareDelivery(email: IncomingEmail, to: Destination): PreparedDelivery | null {
  const { text, reading } = readEmail(email);
  if (reading.status === "ignored") return null;
  const call = (name: string, args: Record<string, unknown>) => ({
    url: `${to.url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`,
    headers: { apikey: to.key, Authorization: `Bearer ${to.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (reading.status === "unknown") {
    return {
      ...call("receive_unmatched", { p_token: to.token, p_sender: email.from ?? null, p_subject: email.subject ?? null, p_body: text }),
      outcome: () => ({ status: "unmatched" }),
    };
  }
  const t = reading.transaction;
  return {
    ...call("receive_notice", { p_token: to.token, p_item: { id: keyOf(t), ...t, notice: { kind: reading.kind, text: text.slice(0, 4000) } } }),
    outcome: (status) => ({ status: status as "new" | "merged" | "known", merchant: t.merchant, amount: t.amount }),
  };
}

/** The server's reason for refusing a call, from a PostgREST error body. */
export function refusal(status: number, body: string): string {
  let message = body;
  try {
    message = (JSON.parse(body) as { message?: string }).message ?? body;
  } catch {
    // Not JSON: keep the raw text.
  }
  return `Supabase respondió ${status}: ${message}`;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Reads an email and hands it to the person's inbox, with fetch. */
export async function deliver(email: IncomingEmail, to: Destination, fetchFn: Fetch = fetch): Promise<Delivery> {
  const call = prepareDelivery(email, to);
  if (!call) return { status: "ignored" };
  const res = await fetchFn(call.url, { method: "POST", headers: call.headers, body: call.body });
  const body = await res.text();
  if (!res.ok) throw new Error(refusal(res.status, body));
  return call.outcome(body ? JSON.parse(body) : null);
}
