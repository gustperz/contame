import { useEffect, useMemo, useReducer, useRef } from "react";
import type { ChatMessage, Expense, ISODate, ParsedMessage, Settings } from "../domain/types";
import { parseMessage } from "../domain/parser";
import { HELP_TEXT, queryReply, undoNote } from "../domain/replies";
import { loadState, newId, saveState, type AppState } from "./store";

type Action =
  | { type: "send"; text: string; now: Date; parsed: ParsedMessage }
  | { type: "updateExpense"; expense: Expense }
  | { type: "deleteExpense"; id: string }
  | { type: "import"; state: AppState }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "clear" };

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
            createdAt: t + i,
            source: d.source,
          }));
          const line = msg(text, t, "expense", { expenseIds: expenses.map((e) => e.id) });
          return { ...state, expenses: [...state.expenses, ...expenses], messages: [...state.messages, line] };
        }
        case "query":
          return { ...state, messages: [...state.messages, msg(text, t, "query", { note: queryReply(parsed, state.expenses, currency, now) })] };
        case "undo": {
          const last = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          return {
            ...state,
            expenses: last ? state.expenses.filter((e) => e.id !== last.id) : state.expenses,
            messages: [...state.messages, msg(text, t, "undo", { note: undoNote(last, currency) })],
          };
        }
        case "help":
          return { ...state, messages: [...state.messages, msg(text, t, "help", { note: HELP_TEXT })] };
        case "unknown":
          return { ...state, messages: [...state.messages, msg(text, t, "plain")] };
        case "setDate":
          return state;
      }
      return state;
    }
    case "updateExpense":
      return { ...state, expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)) };
    case "deleteExpense":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case "import":
      return { ...action.state, settings: { ...state.settings, ...action.state.settings } };
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case "clear":
      return { ...state, expenses: [], messages: [] };
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

  const expensesById = useMemo(() => new Map(state.expenses.map((e) => [e.id, e])), [state.expenses]);

  return {
    state,
    expensesById,
    /**
     * Parses and records a message. Returns the parsed intent so the UI can react
     * to things that do not change state, like switching the working date.
     */
    send: (text: string, defaultDate: ISODate | null): ParsedMessage => {
      const now = new Date();
      const parsed = parseMessage(text, now, { defaultDate: defaultDate ?? undefined });
      if (parsed.intent !== "setDate" && text.trim()) dispatch({ type: "send", text, now, parsed });
      return parsed;
    },
    updateExpense: (expense: Expense) => dispatch({ type: "updateExpense", expense }),
    deleteExpense: (id: string) => dispatch({ type: "deleteExpense", id }),
    importState: (s: AppState) => dispatch({ type: "import", state: s }),
    setSettings: (settings: Partial<Settings>) => dispatch({ type: "settings", settings }),
    clearAll: () => dispatch({ type: "clear" }),
  };
}

export type AppApi = ReturnType<typeof useApp>;
