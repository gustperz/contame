import { useEffect, useMemo, useReducer, useRef } from "react";
import type { ChatMessage, Expense, Settings } from "../domain/types";
import { parseMessage } from "../domain/parser";
import { confirmExpenses, HELP_TEXT, noAmountReply, queryReply, undoReply, WELCOME_TEXT } from "../domain/replies";
import { loadState, newId, saveState, type AppState } from "./store";

type Action =
  | { type: "send"; text: string; now: Date }
  | { type: "updateExpense"; expense: Expense }
  | { type: "deleteExpense"; id: string }
  | { type: "import"; state: AppState }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "clear" };

function msg(role: ChatMessage["role"], text: string, createdAt: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: newId(), role, text, createdAt, ...extra };
}

function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "send": {
      const text = action.text.trim();
      if (!text) return state;
      const now = action.now;
      const t = now.getTime();
      const currency = state.settings.currency;
      const user = msg("user", text, t);
      const parsed = parseMessage(text, now);
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
          const reply = msg("app", confirmExpenses(parsed.expenses, currency, now), t + 1, {
            kind: "expense",
            expenseIds: expenses.map((e) => e.id),
          });
          return { ...state, expenses: [...state.expenses, ...expenses], messages: [...state.messages, user, reply] };
        }
        case "query": {
          const reply = msg("app", queryReply(parsed, state.expenses, currency, now), t + 1, { kind: "query" });
          return { ...state, messages: [...state.messages, user, reply] };
        }
        case "undo": {
          const last = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          const reply = msg("app", undoReply(last, currency), t + 1, { kind: "undo" });
          return {
            ...state,
            expenses: last ? state.expenses.filter((e) => e.id !== last.id) : state.expenses,
            messages: [...state.messages, user, reply],
          };
        }
        case "help":
          return { ...state, messages: [...state.messages, user, msg("app", HELP_TEXT, t + 1, { kind: "info" })] };
        case "unknown":
          return { ...state, messages: [...state.messages, user, msg("app", noAmountReply(), t + 1, { kind: "error" })] };
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
  const s = loadState();
  if (s.messages.length === 0) {
    s.messages = [msg("app", WELCOME_TEXT, Date.now(), { kind: "info" })];
  }
  return s;
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
    send: (text: string) => dispatch({ type: "send", text, now: new Date() }),
    updateExpense: (expense: Expense) => dispatch({ type: "updateExpense", expense }),
    deleteExpense: (id: string) => dispatch({ type: "deleteExpense", id }),
    importState: (s: AppState) => dispatch({ type: "import", state: s }),
    setSettings: (settings: Partial<Settings>) => dispatch({ type: "settings", settings }),
    clearAll: () => dispatch({ type: "clear" }),
  };
}

export type AppApi = ReturnType<typeof useApp>;
