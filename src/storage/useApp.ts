import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Account, ChatMessage, Expense, ISODate, ParsedMessage, Payment, Settings } from "../domain/types";
import { creditStatus, spendItems } from "../domain/credit";
import { parseMessage } from "../domain/parser";
import { HELP_TEXT, queryReply, undoNote } from "../domain/replies";
import { loadState, newId, saveState, sanitizeSettings, type AppState } from "./store";
import { toISODate } from "../utils/dates";
import { applyIncoming, type Incoming } from "../cloud/sync/apply";
import { ALONE, isMine, settingsOf, withMyAccounts, type People } from "../domain/people";
import { bankOf, expenseIdFor, inboxExpense, mergedExpense, type InboxChoice, type InboxItem } from "../domain/inbox";

type Action =
  | { type: "send"; text: string; now: Date; parsed: ParsedMessage; date: ISODate; account: string | null; people: People }
  | { type: "accounts"; accounts: Account[]; defaultAccount?: string; people: People }
  | { type: "convertMessage"; messageId: string; expense: Expense }
  | { type: "deleteMessage"; id: string }
  | { type: "updateExpense"; expense: Expense }
  | { type: "deleteExpense"; id: string }
  | { type: "updatePayment"; payment: Payment }
  | { type: "deletePayment"; id: string }
  | { type: "import"; state: AppState }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "clear" }
  | { type: "remote"; incoming: Incoming }
  | { type: "saveInbox"; entries: InboxEntry[]; now: number; by?: string };

function msg(text: string, createdAt: number, kind: ChatMessage["kind"], extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: newId(), text, createdAt, kind, ...extra };
}

function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "send": {
      const text = action.text.trim();
      if (!text) return state;
      const now = action.now;
      const t = now.getTime();
      const currency = state.settings.currency;
      const parsed = action.parsed;
      // In a shared space every row says who wrote it.
      const by = action.people.me ? { by: action.people.me } : {};
      const mine = (x: { by?: string }) => isMine(x, action.people);
      switch (parsed.intent) {
        case "expense": {
          const expenses: Expense[] = parsed.expenses.map((d, i) => ({
            id: newId(),
            amount: d.amount,
            category: d.category,
            description: d.description,
            date: d.date,
            account: d.account ?? action.account ?? undefined,
            createdAt: t + i,
            source: d.source,
            ...(d.installments ? { installments: d.installments } : {}),
            ...by,
          }));
          const line = msg(text, t, "expense", { expenseIds: expenses.map((e) => e.id), ...by });
          return { ...state, expenses: [...state.expenses, ...expenses], messages: [...state.messages, line] };
        }
        case "payment": {
          const d = parsed.payment;
          const payment: Payment = { id: newId(), amount: d.amount, toAccount: d.toAccount, date: d.date, createdAt: t, source: d.source, ...(d.fromAccount ? { fromAccount: d.fromAccount } : {}), ...by };
          return { ...state, payments: [...state.payments, payment], messages: [...state.messages, msg(text, t, "payment", { paymentId: payment.id, ...by })] };
        }
        case "query": {
          const items = spendItems(state.settings, state.expenses, state.payments);
          const status = creditStatus(state.settings, state.expenses, state.payments);
          return { ...state, messages: [...state.messages, msg(text, t, "query", { note: queryReply(parsed, items, currency, now, state.settings, status), ...by })] };
        }
        case "undo": {
          // Only one's own: "deshacer" never removes what the other person wrote.
          const lastExpense = state.expenses.filter(mine).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          const lastPayment = state.payments.filter(mine).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          if (lastPayment && (!lastExpense || lastPayment.createdAt > lastExpense.createdAt)) {
            return {
              ...state,
              payments: state.payments.filter((p) => p.id !== lastPayment.id),
              messages: [...state.messages, msg(text, t, "undo", { note: undoNote(null, currency, lastPayment, state.settings), ...by })],
            };
          }
          return {
            ...state,
            expenses: lastExpense ? state.expenses.filter((e) => e.id !== lastExpense.id) : state.expenses,
            messages: [...state.messages, msg(text, t, "undo", { note: undoNote(lastExpense, currency), ...by })],
          };
        }
        case "help":
          return { ...state, messages: [...state.messages, msg(text, t, "help", { note: HELP_TEXT, ...by })] };
        case "unknown":
          return { ...state, messages: [...state.messages, msg(text, t, "plain", { date: action.date, ...by })] };
        case "setDate":
        case "setAccount":
          return state;
        default:
          return state;
      }
      return state;
    }
    case "convertMessage":
      return {
        ...state,
        expenses: [...state.expenses, action.expense],
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, kind: "expense" as const, expenseIds: [action.expense.id], date: undefined } : m,
        ),
      };
    case "deleteMessage":
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };
    case "updateExpense":
      return { ...state, expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)) };
    case "deleteExpense":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case "updatePayment":
      return { ...state, payments: state.payments.map((p) => (p.id === action.payment.id ? action.payment : p)) };
    case "deletePayment":
      return { ...state, payments: state.payments.filter((p) => p.id !== action.id) };
    case "import":
      return { ...action.state, settings: { ...state.settings, ...action.state.settings } };
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case "accounts": {
      // The person edits only their own accounts; the other person's stay as they were.
      const settings = sanitizeSettings({ ...state.settings, ...withMyAccounts(state.settings, action.accounts, action.defaultAccount, action.people) });
      const known = new Set(settings.accounts.map((a) => a.id));
      return {
        ...state,
        settings,
        expenses: state.expenses.map((e) => (!e.account || known.has(e.account) ? e : { ...e, account: undefined })),
        payments: state.payments.filter((p) => known.has(p.toAccount)).map((p) => (p.fromAccount && !known.has(p.fromAccount) ? { ...p, fromAccount: undefined } : p)),
      };
    }
    case "clear":
      return { ...state, expenses: [], payments: [], messages: [] };
    case "remote":
      return applyIncoming(state, action.incoming);
    case "saveInbox":
      return saveInbox(state, action.entries, action.now, action.by);
  }
}

/** A purchase from the inbox as the person confirmed it, plus what to remember for next time. */
export interface InboxEntry {
  item: InboxItem;
  choice: InboxChoice;
  /** "This card belongs to the chosen account." */
  rememberCard?: boolean;
  /** "This bank's notices land on the chosen account" (for notices without card digits). */
  rememberSource?: boolean;
  /** Other purchases joined with `item` into a single expense; `item` is the earliest. */
  merged?: InboxItem[];
}

/**
 * Adds the confirmed purchases as expenses, with one chat line that holds them,
 * and learns the cards and banks the person asked to remember. Merchant
 * categories are not stored: the next proposal reads them from these expenses.
 * A purchase already saved (on this phone or another) is not added again.
 */
export function saveInbox(state: AppState, entries: InboxEntry[], now: number, by?: string): AppState {
  const existing = new Set(state.expenses.map((e) => e.id));
  const fresh = entries.filter((x) => !existing.has(expenseIdFor(x.item)));
  const author = by ? { by } : {};
  const expenses = fresh.map((x) => ({ ...(x.merged?.length ? mergedExpense([x.item, ...x.merged], x.choice) : inboxExpense(x.item, x.choice)), ...author }));
  let accounts = state.settings.accounts;
  for (const x of entries) {
    const bank = bankOf(x.item);
    const chosen = accounts.find((a) => a.id === x.choice.account);
    if (x.rememberSource && bank && chosen) {
      // One account per bank and credit type: a bank's debit notices and its card's can go to different accounts.
      accounts = accounts.map((a) => {
        const others = (a.sources ?? []).filter((s) => s !== bank || !!a.credit !== !!chosen.credit);
        const sources = a.id === chosen.id ? [...others, bank] : others;
        return { ...a, sources: sources.length ? sources : undefined };
      });
    }
    const last4 = x.item.last4;
    if (x.rememberCard && last4 && x.choice.account) {
      // A card belongs to one account: move it if it was elsewhere.
      accounts = accounts.map((a) => {
        const others = (a.cards ?? []).filter((c) => c !== last4);
        const cards = a.id === x.choice.account ? [...others, last4] : others;
        return { ...a, cards: cards.length ? cards : undefined };
      });
    }
  }
  const settings = sanitizeSettings({ ...state.settings, accounts });
  if (!expenses.length) return { ...state, settings };
  const text = expenses.length === 1 ? "Movimiento de la bandeja" : `${expenses.length} movimientos de la bandeja`;
  return {
    ...state,
    settings,
    expenses: [...state.expenses, ...expenses],
    messages: [...state.messages, msg(text, now, "expense", { expenseIds: expenses.map((e) => e.id), ...author })],
  };
}

function init(): AppState {
  return loadState();
}

export function useApp() {
  const [state, dispatch] = useReducer(reduce, undefined, init);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveState(state);
  }, [state]);

  /** Who is writing, set by the app once the session and its shared space are known. */
  const people = useRef<People>(ALONE);
  const setPeople = useCallback((p: People) => {
    people.current = p;
  }, []);
  const applyRemote = useCallback((incoming: Incoming) => dispatch({ type: "remote", incoming }), []);
  const expensesById = useMemo(() => new Map(state.expenses.map((e) => [e.id, e])), [state.expenses]);
  const paymentsById = useMemo(() => new Map(state.payments.map((p) => [p.id, p])), [state.payments]);
  /** Everything that counts as spending: purchases plus card payments (category Deuda). */
  const spending = useMemo(() => spendItems(state.settings, state.expenses, state.payments), [state.settings, state.expenses, state.payments]);

  return {
    state,
    expensesById,
    paymentsById,
    spending,
    /**
     * Parses and records a message. Returns the parsed intent so the UI can react
     * to things that do not change state, like switching the working date.
     */
    send: (text: string, defaultDate: ISODate | null, defaultAccount: string | null): ParsedMessage => {
      const now = new Date();
      // Account names in a message, and the default account, are the writer's own.
      const my = settingsOf(state.settings, people.current.me, people.current);
      const parsed = parseMessage(text, now, { defaultDate: defaultDate ?? undefined, accounts: my.accounts });
      if (parsed.intent !== "setDate" && parsed.intent !== "setAccount" && text.trim()) {
        // "" pins "no account" explicitly; null means "use the default account, if any".
        const account = defaultAccount === "" ? null : defaultAccount ?? my.defaultAccount ?? null;
        dispatch({ type: "send", text, now, parsed, date: defaultDate ?? toISODate(now), account, people: people.current });
      }
      return parsed;
    },
    /** Replaces the account list and optional default; expenses of removed accounts are left without account. */
    updateAccounts: (accounts: Account[], defaultAccount?: string) => dispatch({ type: "accounts", accounts, defaultAccount, people: people.current }),
    setPeople,
    /** Turns an unparsed text line into an expense the user completed by hand. */
    convertMessage: (messageId: string, expense: Expense) =>
      dispatch({ type: "convertMessage", messageId, expense: people.current.me ? { ...expense, by: people.current.me } : expense }),
    deleteMessage: (id: string) => dispatch({ type: "deleteMessage", id }),
    updateExpense: (expense: Expense) => dispatch({ type: "updateExpense", expense }),
    deleteExpense: (id: string) => dispatch({ type: "deleteExpense", id }),
    updatePayment: (payment: Payment) => dispatch({ type: "updatePayment", payment }),
    deletePayment: (id: string) => dispatch({ type: "deletePayment", id }),
    importState: (s: AppState) => dispatch({ type: "import", state: s }),
    setSettings: (settings: Partial<Settings>) => dispatch({ type: "settings", settings }),
    clearAll: () => dispatch({ type: "clear" }),
    /** Merges changes downloaded from the account. */
    applyRemote,
    /** Saves purchases confirmed from the inbox. */
    saveInbox: (entries: InboxEntry[]) => dispatch({ type: "saveInbox", entries, now: Date.now(), by: people.current.me ?? undefined }),
  };
}

export type AppApi = ReturnType<typeof useApp>;
