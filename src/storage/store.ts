import type { ChatMessage, Expense, Settings } from "../domain/types";
import { DEFAULT_CURRENCY } from "../utils/money";
import { DEFAULT_ACCOUNTS } from "../domain/accounts";
import type { Account } from "../domain/types";

export interface AppState {
  version: 4;
  expenses: Expense[];
  messages: ChatMessage[];
  settings: Settings;
}

export const STORAGE_KEY = "contame:v1";
export const CURRENT_VERSION = 4;
const MAX_MESSAGES = 600;

export function emptyState(): AppState {
  return {
    version: 4,
    expenses: [],
    messages: [],
    settings: { currency: DEFAULT_CURRENCY, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a, aliases: [...a.aliases] })) },
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
  // Version 3 forced a default account the user never chose; start version 4 without one.
  const rawSettings = { ...base.settings, ...(parsed.settings ?? {}) };
  if ((parsed.version as number | undefined) === 3) delete rawSettings.defaultAccount;
  const settings = sanitizeSettings(rawSettings);
  const known = new Set(settings.accounts.map((a) => a.id));
  // Version 3 assigned "efectivo" to every expense by default; version 4 leaves expenses without account instead.
  const legacyDefault = (parsed.version as number | undefined) === 3 ? "efectivo" : null;
  return {
    version: 4,
    expenses: expenses.map((e) => {
      const account = e.account && known.has(e.account) && e.account !== legacyDefault ? e.account : undefined;
      return account === e.account ? e : { ...e, account };
    }),
    messages: messages.slice(-MAX_MESSAGES),
    settings,
  };
}

export function sanitizeSettings(s: Partial<Settings>): Settings {
  const accounts: Account[] = Array.isArray(s.accounts)
    ? s.accounts
        .filter((a): a is Account => !!a && typeof a.id === "string" && typeof a.name === "string")
        .map((a) => ({ id: a.id, name: a.name, emoji: typeof a.emoji === "string" && a.emoji ? a.emoji : "💳", aliases: Array.isArray(a.aliases) ? a.aliases.filter((x) => typeof x === "string") : [] }))
    : DEFAULT_ACCOUNTS.map((a) => ({ ...a, aliases: [...a.aliases] }));
  const defaultAccount = accounts.some((a) => a.id === s.defaultAccount) ? s.defaultAccount : undefined;
  return { currency: typeof s.currency === "string" ? s.currency : DEFAULT_CURRENCY, accounts, ...(defaultAccount ? { defaultAccount } : {}) };
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
