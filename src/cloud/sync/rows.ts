import type { AppState } from "../../storage/store";
import type { Account, ChatMessage, Expense, MessageKind, Payment } from "../../domain/types";

/** The tables the phone keeps in sync. The inbox is read separately. */
export type Table = "accounts" | "settings" | "expenses" | "payments" | "messages";
export const TABLES: readonly Table[] = ["accounts", "settings", "expenses", "payments", "messages"];

/**
 * A row as the phone sees it, flattened and with explicit nulls so that the
 * same data always hashes the same, whichever side it came from.
 */
export type Row = { id: string } & Record<string, string | number | boolean | string[] | null>;

export type RowsByTable = Record<Table, Map<string, Row>>;

/** The settings table has one row per person; locally it gets a fixed id. */
export const SETTINGS_ID = "settings";

export function accountRow(a: Account, position: number): Row {
  return {
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    aliases: [...a.aliases],
    credit: !!a.credit,
    initialDebt: a.initialDebt ?? 0,
    position,
  };
}

export function expenseRow(e: Expense): Row {
  return {
    id: e.id,
    amount: e.amount,
    category: e.category,
    account: e.account || null,
    description: e.description,
    date: e.date,
    createdAt: e.createdAt,
    source: e.source || null,
    installments: e.installments && e.installments > 1 ? e.installments : null,
  };
}

export function paymentRow(p: Payment): Row {
  return {
    id: p.id,
    amount: p.amount,
    toAccount: p.toAccount,
    fromAccount: p.fromAccount || null,
    date: p.date,
    createdAt: p.createdAt,
    source: p.source || null,
  };
}

export function messageRow(m: ChatMessage): Row {
  return {
    id: m.id,
    text: m.text,
    kind: m.kind,
    createdAt: m.createdAt,
    expenseIds: m.expenseIds?.length ? [...m.expenseIds] : null,
    paymentId: m.paymentId || null,
    note: m.note || null,
    date: m.date || null,
  };
}

/** Every syncable row in the state, by table and id. */
export function rowsOf(state: AppState): RowsByTable {
  const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r]));
  return {
    accounts: byId(state.settings.accounts.map(accountRow)),
    settings: byId([{ id: SETTINGS_ID, currency: state.settings.currency, defaultAccount: state.settings.defaultAccount || null }]),
    expenses: byId(state.expenses.map(expenseRow)),
    payments: byId(state.payments.map(paymentRow)),
    messages: byId(state.messages.map(messageRow)),
  };
}

export function toExpense(r: Row): Expense {
  return {
    id: r.id,
    amount: r.amount as number,
    category: r.category as Expense["category"],
    description: r.description as string,
    date: r.date as string,
    createdAt: r.createdAt as number,
    ...(r.account ? { account: r.account as string } : {}),
    ...(r.source ? { source: r.source as string } : {}),
    ...(r.installments ? { installments: r.installments as number } : {}),
  };
}

export function toPayment(r: Row): Payment {
  return {
    id: r.id,
    amount: r.amount as number,
    toAccount: r.toAccount as string,
    date: r.date as string,
    createdAt: r.createdAt as number,
    ...(r.fromAccount ? { fromAccount: r.fromAccount as string } : {}),
    ...(r.source ? { source: r.source as string } : {}),
  };
}

export function toMessage(r: Row): ChatMessage {
  return {
    id: r.id,
    text: r.text as string,
    kind: r.kind as MessageKind,
    createdAt: r.createdAt as number,
    ...(r.expenseIds ? { expenseIds: r.expenseIds as string[] } : {}),
    ...(r.paymentId ? { paymentId: r.paymentId as string } : {}),
    ...(r.note ? { note: r.note as string } : {}),
    ...(r.date ? { date: r.date as string } : {}),
  };
}

export function toAccount(r: Row): Account {
  return {
    id: r.id,
    name: r.name as string,
    emoji: r.emoji as string,
    aliases: (r.aliases as string[]) ?? [],
    ...(r.credit ? { credit: true } : {}),
    ...((r.initialDebt as number) > 0 ? { initialDebt: r.initialDebt as number } : {}),
  };
}

/** Order-independent JSON, so hashing does not depend on how a row was built. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A short fingerprint of a row (cyrb53). Only has to tell "changed" from "same". */
export function hashRow(row: Row): string {
  const str = stableStringify(row);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
