import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Account, ChatMessage, Expense, ISODate, ParsedMessage, Payment, Settings } from "../domain/types";
import { creditStatus, spendItems } from "../domain/credit";
import { parseMessage } from "../domain/parser";
import { HELP_TEXT, queryReply, undoNote } from "../domain/replies";
import { loadState, newId, saveState, sanitizeSettings, type AppState } from "./store";
import { toISODate } from "../utils/dates";
import { applyIncoming, type Incoming } from "../cloud/sync/apply";

type Action =
  | { type: "send"; text: string; now: Date; parsed: ParsedMessage; date: ISODate; account: string | null }
  | { type: "accounts"; accounts: Account[]; defaultAccount?: string }
  | { type: "convertMessage"; messageId: string; expense: Expense }
  | { type: "deleteMessage"; id: string }
  | { type: "updateExpense"; expense: Expense }
  | { type: "deleteExpense"; id: string }
  | { type: "updatePayment"; payment: Payment }
  | { type: "deletePayment"; id: string }
  | { type: "import"; state: AppState }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "clear" }
  | { type: "remote"; incoming: Incoming };

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
          }));
          const line = msg(text, t, "expense", { expenseIds: expenses.map((e) => e.id) });
          return { ...state, expenses: [...state.expenses, ...expenses], messages: [...state.messages, line] };
        }
        case "payment": {
          const d = parsed.payment;
          const payment: Payment = { id: newId(), amount: d.amount, toAccount: d.toAccount, date: d.date, createdAt: t, source: d.source, ...(d.fromAccount ? { fromAccount: d.fromAccount } : {}) };
          return { ...state, payments: [...state.payments, payment], messages: [...state.messages, msg(text, t, "payment", { paymentId: payment.id })] };
        }
        case "query": {
          const items = spendItems(state.settings, state.expenses, state.payments);
          const status = creditStatus(state.settings, state.expenses, state.payments);
          return { ...state, messages: [...state.messages, msg(text, t, "query", { note: queryReply(parsed, items, currency, now, state.settings, status) })] };
        }
        case "undo": {
          const lastExpense = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          const lastPayment = [...state.payments].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          if (lastPayment && (!lastExpense || lastPayment.createdAt > lastExpense.createdAt)) {
            return {
              ...state,
              payments: state.payments.filter((p) => p.id !== lastPayment.id),
              messages: [...state.messages, msg(text, t, "undo", { note: undoNote(null, currency, lastPayment, state.settings) })],
            };
          }
          return {
            ...state,
            expenses: lastExpense ? state.expenses.filter((e) => e.id !== lastExpense.id) : state.expenses,
            messages: [...state.messages, msg(text, t, "undo", { note: undoNote(lastExpense, currency) })],
          };
        }
        case "help":
          return { ...state, messages: [...state.messages, msg(text, t, "help", { note: HELP_TEXT })] };
        case "unknown":
          return { ...state, messages: [...state.messages, msg(text, t, "plain", { date: action.date })] };
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
      const settings = sanitizeSettings({ ...state.settings, accounts: action.accounts, defaultAccount: action.defaultAccount });
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
  }
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
      const parsed = parseMessage(text, now, { defaultDate: defaultDate ?? undefined, accounts: state.settings.accounts });
      if (parsed.intent !== "setDate" && parsed.intent !== "setAccount" && text.trim()) {
        // "" pins "no account" explicitly; null means "use the default account, if any".
        const account = defaultAccount === "" ? null : defaultAccount ?? state.settings.defaultAccount ?? null;
        dispatch({ type: "send", text, now, parsed, date: defaultDate ?? toISODate(now), account });
      }
      return parsed;
    },
    /** Replaces the account list and optional default; expenses of removed accounts are left without account. */
    updateAccounts: (accounts: Account[], defaultAccount?: string) => dispatch({ type: "accounts", accounts, defaultAccount }),
    /** Turns an unparsed text line into an expense the user completed by hand. */
    convertMessage: (messageId: string, expense: Expense) => dispatch({ type: "convertMessage", messageId, expense }),
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
  };
}

export type AppApi = ReturnType<typeof useApp>;
