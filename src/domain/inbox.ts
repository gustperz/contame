import type { CategoryId, Expense, Settings } from "./types";
import { findCategory } from "./parser/category";
import { normalize } from "../utils/text";
import { addDays, fromISODate, toISODate } from "../utils/dates";

/** One bank notice (email or SMS) that reported a purchase. */
export interface InboxNotice {
  kind: string;
  text: string;
  receivedAt: string;
}

/** A purchase captured automatically and waiting for the person to confirm it. */
export interface InboxItem {
  /** Card, amount and purchase time: two notices of one purchase share it. */
  id: string;
  amount: number;
  merchant: string;
  last4: string | null;
  /** YYYY-MM-DD, as the bank reports it. */
  date: string;
  /** HH:MM, 24 hour, local time of the purchase. */
  time: string;
  /** The notice itself says it was a credit card. */
  credit: boolean;
  notices: InboxNotice[];
}

/** What the person decides to save; starts as the app's guess. */
export interface InboxChoice {
  description: string;
  amount: number;
  category: CategoryId;
  account?: string;
}

export interface Proposal extends InboxChoice {
  /** Where the category came from: a rule the person set, a keyword, or nothing. */
  categoryFrom: "rule" | "guess" | "none";
  /**
   * How the account was found: by the card's last digits, by the bank the
   * notice came from (an association the person made), by the account's name
   * matching that bank, or not at all.
   */
  accountFrom: "card" | "source" | "name" | null;
  /** An expense already on the phone that looks like this same purchase. */
  duplicate: Expense | null;
}

/** The key a merchant rule is stored under: lower case, no accents, single spaces. */
export function merchantKey(merchant: string): string {
  return normalize(merchant);
}

export function accountForCard(settings: Settings, last4: string | null): string | undefined {
  if (!last4) return undefined;
  return settings.accounts.find((a) => a.cards?.includes(last4))?.id;
}

/** The banks whose notices the mailbox reads, and the words their accounts are usually named with. */
export const BANKS: ReadonlyArray<{ id: string; name: string; words: string[] }> = [
  { id: "lulo", name: "Lulo", words: ["lulo"] },
  { id: "bogota", name: "Banco de Bogotá", words: ["bogota"] },
  { id: "nequi", name: "Nequi", words: ["nequi"] },
  { id: "davivienda", name: "Davivienda", words: ["davivienda"] },
  // PSE does not say which bank paid; it can only be associated by hand.
  { id: "pse", name: "PSE", words: [] },
];

export function bankName(id: string): string {
  return BANKS.find((b) => b.id === id)?.name ?? id;
}

/** The bank a purchase was reported by, from its first notice ("nequi-breb-email" -> "nequi"). */
export function bankOf(item: InboxItem): string | null {
  const prefix = item.notices[0]?.kind.split("-")[0] ?? "";
  return BANKS.some((b) => b.id === prefix) ? prefix : null;
}

/**
 * Among accounts, the one for a notice's credit type. A notice that says it
 * was a credit card only goes to a credit account; one that does not say
 * (a text message, a transfer) prefers a debit account but takes a card too.
 */
function byCredit(candidates: Settings["accounts"], credit: boolean) {
  if (credit) return candidates.find((a) => a.credit);
  return candidates.find((a) => !a.credit) ?? candidates[0];
}

/**
 * The account for a bank's notice: the one the person associated with that
 * bank, or else one whose name or aliases say the bank ("Nequi", "Banco Bogotá").
 */
export function accountForSource(settings: Settings, bank: string | null, credit: boolean): { id: string; from: "source" | "name" } | undefined {
  if (!bank) return undefined;
  const associated = byCredit(settings.accounts.filter((a) => a.sources?.includes(bank)), credit);
  if (associated) return { id: associated.id, from: "source" };
  const words = BANKS.find((b) => b.id === bank)?.words ?? [];
  if (!words.length) return undefined;
  const named = settings.accounts.filter((a) => {
    const text = ` ${normalize([a.name, ...a.aliases].join(" "))} `;
    return words.some((w) => text.includes(` ${w} `));
  });
  const match = byCredit(named, credit);
  return match ? { id: match.id, from: "name" } : undefined;
}

/** The id the expense gets, so saving the same purchase twice never duplicates it. */
export function expenseIdFor(item: InboxItem): string {
  return `bank:${item.id}`;
}

/**
 * An expense typed by hand for the same amount within a day of the purchase:
 * probably the same one, noted before the bank notice arrived.
 */
export function findDuplicate(item: InboxItem, expenses: Expense[]): Expense | null {
  const day = fromISODate(item.date);
  const days = new Set([toISODate(addDays(day, -1)), item.date, toISODate(addDays(day, 1))]);
  const id = expenseIdFor(item);
  return expenses.find((e) => e.id !== id && e.origin === undefined && Math.round(e.amount) === Math.round(item.amount) && days.has(e.date)) ?? null;
}

export function propose(item: InboxItem, settings: Settings, expenses: Expense[]): Proposal {
  const rule = settings.merchantCategories?.[merchantKey(item.merchant)];
  const guess = findCategory(merchantKey(item.merchant)).category;
  const category: CategoryId = rule ?? guess;
  const byCard = accountForCard(settings, item.last4);
  const bySource = byCard ? undefined : accountForSource(settings, bankOf(item), item.credit);
  return {
    description: item.merchant,
    amount: item.amount,
    category,
    account: byCard ?? bySource?.id,
    categoryFrom: rule ? "rule" : guess !== "otros" ? "guess" : "none",
    accountFrom: byCard ? "card" : (bySource?.from ?? null),
    duplicate: findDuplicate(item, expenses),
  };
}

/** What still needs a look before saving. */
export function needsReview(p: Proposal): { account: boolean; category: boolean } {
  return { account: !p.account, category: p.categoryFrom === "none" };
}

/** The purchase time on the phone's clock, which is what the chat shows. */
export function purchaseTime(item: InboxItem): number {
  const [y, m, d] = item.date.split("-").map(Number);
  const [h, min] = item.time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

export function inboxExpense(item: InboxItem, choice: InboxChoice): Expense {
  const notice = item.notices[0]?.text.trim();
  return {
    id: expenseIdFor(item),
    amount: choice.amount,
    category: choice.category,
    description: choice.description.trim() || item.merchant,
    date: item.date,
    createdAt: purchaseTime(item),
    origin: "bank",
    ...(choice.account ? { account: choice.account } : {}),
    ...(notice ? { source: notice } : {}),
  };
}

const NOTICE_NAMES: Record<string, string> = {
  "lulo-email": "Correo Lulo",
  "lulo-sms": "SMS Lulo",
  "bogota-sms": "SMS Banco de Bogotá",
  "bogota-pse": "SMS Banco de Bogotá",
  "pse-email": "Correo PSE",
  "nequi-breb-email": "Correo Nequi",
  "nequi-bill-email": "Correo Nequi",
  "bogota-transfer-email": "Correo Banco de Bogotá",
  "davivienda-email": "Correo Davivienda",
};

export function noticeName(kind: string): string {
  return NOTICE_NAMES[kind] ?? "Aviso del banco";
}

/** "Dos para revisar: a uno le falta la cuenta y de otro no adiviné la categoría." */
export function reviewSummary(proposals: Proposal[]): string | null {
  const reviews = proposals.map(needsReview);
  const noAccount = reviews.filter((r) => r.account).length;
  const noCategory = reviews.filter((r) => r.category).length;
  const flagged = reviews.filter((r) => r.account || r.category).length;
  const duplicates = proposals.filter((p) => p.duplicate).length;
  const parts: string[] = [];
  if (flagged === 1) {
    const r = reviews.find((x) => x.account || x.category)!;
    const what = [r.account && "le falta la cuenta", r.category && "no adiviné la categoría"].filter(Boolean).join(" y ");
    parts.push(`Uno para revisar: ${what}.`);
  } else if (flagged > 1) {
    const what = [
      noAccount && (noAccount === 1 ? "a uno le falta la cuenta" : `a ${noAccount} les falta la cuenta`),
      noCategory && (noCategory === 1 ? "de uno no adiviné la categoría" : `de ${noCategory} no adiviné la categoría`),
    ]
      .filter(Boolean)
      .join(" y ");
    parts.push(`${flagged} para revisar: ${what}.`);
  }
  if (duplicates === 1) parts.push("Dejé sin marcar uno que parece ya anotado.");
  else if (duplicates > 1) parts.push(`Dejé sin marcar ${duplicates} que parecen ya anotados.`);
  return parts.length ? parts.join(" ") : null;
}
