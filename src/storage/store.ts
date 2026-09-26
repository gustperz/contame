import type { ChatMessage, Expense, Payment, Settings } from "../domain/types";
import { DEFAULT_CURRENCY } from "../utils/money";
import { DEFAULT_ACCOUNTS } from "../domain/accounts";
import type { Account, CategoryId } from "../domain/types";
import { CATEGORY_BY_ID } from "../domain/categories";

export interface AppState {
  version: 5;
  expenses: Expense[];
  payments: Payment[];
  messages: ChatMessage[];
  settings: Settings;
}

export const STORAGE_KEY = "contame:v1";
export const CURRENT_VERSION = 5;
/** The phone keeps only the latest messages; older ones are trimmed, not deleted. */
export const MAX_MESSAGES = 600;

export function emptyState(): AppState {
  return {
    version: 5,
    expenses: [],
    payments: [],
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
  paymentId?: string;
  date?: string;
}

const VALID_KINDS = new Set(["expense", "payment", "plain", "query", "undo", "help"]);

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
    out.push({ id: m.id, text: m.text, createdAt: m.createdAt, kind, expenseIds: m.expenseIds, note: m.note, ...(m.paymentId ? { paymentId: m.paymentId } : {}), ...(m.date ? { date: m.date } : {}) });
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
  const payments = Array.isArray(parsed.payments)
    ? parsed.payments.filter(
        (p): p is Payment =>
          !!p && typeof p.id === "string" && typeof p.amount === "number" && typeof p.date === "string" && typeof p.toAccount === "string" && known.has(p.toAccount),
      ).map((p) => (p.fromAccount && !known.has(p.fromAccount) ? { ...p, fromAccount: undefined } : p))
    : [];
  return {
    version: 5,
    expenses: expenses.map((e) => {
      const account = e.account && known.has(e.account) && e.account !== legacyDefault ? e.account : undefined;
      return account === e.account ? e : { ...e, account };
    }),
    payments,
    messages: messages.slice(-MAX_MESSAGES),
    settings,
  };
}

export function sanitizeSettings(s: Partial<Settings>): Settings {
  const accounts: Account[] = Array.isArray(s.accounts)
    ? s.accounts
        .filter((a): a is Account => !!a && typeof a.id === "string" && typeof a.name === "string")
        .map((a) => ({
          id: a.id,
          name: a.name,
          emoji: typeof a.emoji === "string" && a.emoji ? a.emoji : "💳",
          aliases: Array.isArray(a.aliases) ? a.aliases.filter((x) => typeof x === "string") : [],
          ...(a.credit ? { credit: true } : {}),
          ...(typeof a.initialDebt === "number" && a.initialDebt > 0 ? { initialDebt: a.initialDebt } : {}),
          ...cardsOf(a.cards),
        }))
    : DEFAULT_ACCOUNTS.map((a) => ({ ...a, aliases: [...a.aliases] }));
  const defaultAccount = accounts.some((a) => a.id === s.defaultAccount) ? s.defaultAccount : undefined;
  const rules = merchantRules(s.merchantCategories);
  return {
    currency: typeof s.currency === "string" ? s.currency : DEFAULT_CURRENCY,
    accounts,
    ...(defaultAccount ? { defaultAccount } : {}),
    ...(rules ? { merchantCategories: rules } : {}),
  };
}

/** Distinct four-digit card endings; omitted when there are none. */
export function cardsOf(cards: unknown): { cards?: string[] } {
  if (!Array.isArray(cards)) return {};
  const clean = [...new Set(cards.filter((c): c is string => typeof c === "string" && /^\d{4}$/.test(c)))];
  return clean.length ? { cards: clean } : {};
}

function merchantRules(rules: unknown): Record<string, CategoryId> | undefined {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return undefined;
  const clean = Object.fromEntries(
    Object.entries(rules as Record<string, unknown>).filter((e): e is [string, CategoryId] => !!e[0] && typeof e[1] === "string" && e[1] in CATEGORY_BY_ID),
  );
  return Object.keys(clean).length ? clean : undefined;
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
