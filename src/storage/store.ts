import type { ChatMessage, Expense, Settings } from "../domain/types";
import { DEFAULT_CURRENCY } from "../utils/money";

export interface AppState {
  version: 1;
  expenses: Expense[];
  messages: ChatMessage[];
  settings: Settings;
}

export const STORAGE_KEY = "contame:v1";
const MAX_MESSAGES = 600;

export function emptyState(): AppState {
  return { version: 1, expenses: [], messages: [], settings: { currency: DEFAULT_CURRENCY } };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return sanitize(parsed);
  } catch {
    return emptyState();
  }
}

export function sanitize(parsed: Partial<AppState>): AppState {
  const base = emptyState();
  const expenses = Array.isArray(parsed.expenses)
    ? parsed.expenses.filter(
        (e): e is Expense =>
          !!e && typeof e.id === "string" && typeof e.amount === "number" && typeof e.date === "string" && typeof e.category === "string",
      )
    : [];
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.filter((m): m is ChatMessage => !!m && typeof m.id === "string" && typeof m.text === "string")
    : [];
  return {
    version: 1,
    expenses,
    messages: messages.slice(-MAX_MESSAGES),
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
  };
}

export function saveState(state: AppState): void {
  try {
    const trimmed = { ...state, messages: state.messages.slice(-MAX_MESSAGES) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn("No se pudo guardar el estado", err);
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
