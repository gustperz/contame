import type { ChatMessage, Expense, Settings } from "../domain/types";
import { DEFAULT_CURRENCY } from "../utils/money";
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_ID } from "../domain/accounts";
import type { Account } from "../domain/types";

export interface AppState {
  version: 3;
  expenses: Expense[];
  messages: ChatMessage[];
  settings: Settings;
}

export const STORAGE_KEY = "contame:v1";
export const CURRENT_VERSION = 3;
const MAX_MESSAGES = 600;

export function emptyState(): AppState {
  return {
    version: 3,
    expenses: [],
    messages: [],
    settings: { currency: DEFAULT_CURRENCY, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a, aliases: [...a.aliases] })), defaultAccount: DEFAULT_ACCOUNT_ID },
  };
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

/** Shape of messages stored by version 1 (user/app pairs). */
interface LegacyMessage {
  id: string;
  role?: "user" | "app";
  text: string;
  createdAt: number;
  expenseIds?: string[];
  kind?: string;
  note?: string;
}

const VALID_KINDS = new Set(["expense", "plain", "query", "undo", "help"]);

/**
 * Version 1 stored a user message followed by an app reply. Version 2 keeps a
 * single line per user message, so fold each reply into the message before it.
 */
export function migrateMessages(raw: LegacyMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (m.role === "app") {
      const prev = out[out.length - 1];
      if (!prev) continue; // welcome message or orphan reply
      if (m.expenseIds?.length) {
        prev.kind = "expense";
        prev.expenseIds = m.expenseIds;
      } else if (m.kind === "query") {
        prev.kind = "query";
        prev.note = m.text;
      } else if (m.kind === "undo") {
        prev.kind = "undo";
        prev.note = m.text;
      } else if (m.kind === "info") {
        prev.kind = "help";
      }
      continue;
    }
    const kind = m.role === "user" ? "plain" : VALID_KINDS.has(m.kind ?? "") ? (m.kind as ChatMessage["kind"]) : "plain";
    out.push({ id: m.id, text: m.text, createdAt: m.createdAt, kind, expenseIds: m.expenseIds, note: m.note });
  }
  return out;
}

export function sanitize(parsed: Partial<AppState> & { version?: number }): AppState {
  const base = emptyState();
  const expenses = Array.isArray(parsed.expenses)
    ? parsed.expenses.filter(
        (e): e is Expense =>
          !!e && typeof e.id === "string" && typeof e.amount === "number" && typeof e.date === "string" && typeof e.category === "string",
      )
    : [];
  const rawMessages = Array.isArray(parsed.messages)
    ? (parsed.messages as unknown[]).filter(
        (m): m is LegacyMessage => !!m && typeof (m as LegacyMessage).id === "string" && typeof (m as LegacyMessage).text === "string",
      )
    : [];
  const messages = (parsed.version ?? 1) < 2 ? migrateMessages(rawMessages) : migrateMessages(rawMessages.filter((m) => m.role !== "app"));
  const settings = sanitizeSettings({ ...base.settings, ...(parsed.settings ?? {}) });
  const known = new Set(settings.accounts.map((a) => a.id));
  return {
    version: 3,
    expenses: expenses.map((e) => (e.account && known.has(e.account) ? e : { ...e, account: settings.defaultAccount })),
    messages: messages.slice(-MAX_MESSAGES),
    settings,
  };
}

export function sanitizeSettings(s: Settings): Settings {
  const accounts: Account[] = (Array.isArray(s.accounts) ? s.accounts : [])
    .filter((a): a is Account => !!a && typeof a.id === "string" && typeof a.name === "string")
    .map((a) => ({ id: a.id, name: a.name, emoji: typeof a.emoji === "string" && a.emoji ? a.emoji : "💳", aliases: Array.isArray(a.aliases) ? a.aliases.filter((x) => typeof x === "string") : [] }));
  const list = accounts.length ? accounts : DEFAULT_ACCOUNTS.map((a) => ({ ...a, aliases: [...a.aliases] }));
  const defaultAccount = list.some((a) => a.id === s.defaultAccount) ? s.defaultAccount : list[0].id;
  return { currency: typeof s.currency === "string" ? s.currency : DEFAULT_CURRENCY, accounts: list, defaultAccount };
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
