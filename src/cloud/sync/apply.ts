import { sanitize, type AppState } from "../../storage/store";
import { accountRow, SETTINGS_ID, TABLES, toAccount, toExpense, toMessage, toPayment, type Row, type Table } from "./rows";

/** Changes that came from the server and the phone accepted. */
export interface Incoming {
  upserts: Record<Table, Row[]>;
  deletes: Record<Table, string[]>;
}

export function emptyIncoming(): Incoming {
  return {
    upserts: Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, Row[]>,
    deletes: Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, string[]>,
  };
}

export function isEmptyIncoming(inc: Incoming): boolean {
  return TABLES.every((t) => inc.upserts[t].length === 0 && inc.deletes[t].length === 0);
}

function merge<T extends { id: string }>(items: T[], upserts: Row[], deletes: string[], convert: (r: Row) => T): T[] {
  if (!upserts.length && !deletes.length) return items;
  const gone = new Set(deletes);
  const byId = new Map(items.filter((x) => !gone.has(x.id)).map((x) => [x.id, x]));
  for (const r of upserts) byId.set(r.id, convert(r));
  return [...byId.values()];
}

/**
 * The state with the server's changes applied, cleaned the same way as data
 * loaded from the phone, so nothing downloaded can put the app in a state it
 * could not have reached on its own.
 */
export function applyIncoming(state: AppState, inc: Incoming): AppState {
  if (isEmptyIncoming(inc)) return state;
  // Accounts keep the order set on whichever phone arranged them last.
  const accountRows = merge(
    state.settings.accounts.map(accountRow),
    inc.upserts.accounts,
    inc.deletes.accounts,
    (r) => r,
  );
  const accounts = accountRows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.position as number) - (b.r.position as number) || a.i - b.i)
    .map(({ r }) => toAccount(r));
  const settingsRow = inc.upserts.settings.find((r) => r.id === SETTINGS_ID);
  const settings = {
    currency: settingsRow ? (settingsRow.currency as string) : state.settings.currency,
    accounts,
    defaultAccount: settingsRow ? ((settingsRow.defaultAccount as string | null) ?? undefined) : state.settings.defaultAccount,
  };
  const messages = merge(state.messages, inc.upserts.messages, inc.deletes.messages, toMessage).sort((a, b) => a.createdAt - b.createdAt);
  return sanitize({
    version: 5,
    settings,
    expenses: merge(state.expenses, inc.upserts.expenses, inc.deletes.expenses, toExpense),
    payments: merge(state.payments, inc.upserts.payments, inc.deletes.payments, toPayment),
    messages,
  });
}
