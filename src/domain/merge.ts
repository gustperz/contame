import type { CategoryId, Expense } from "./types";
import { normalize } from "../utils/text";
import { addDays, fromISODate, toISODate } from "../utils/dates";

/** What the person decides for expenses joined into one; the amount is always their sum. */
export interface JoinChoice {
  description: string;
  category: CategoryId;
  account?: string;
}

/** What each expense was before joining: its own messages, or its name when it has none. */
function sourcesOf(e: Expense): string[] {
  const lines = (e.source ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : [e.description];
}

/**
 * Saved expenses joined into one: the restaurant and its tip, a purchase noted
 * in two parts. It stays in `keep` (its id, origin and author), adds up the
 * amounts, is dated on the latest of them, counts every movement behind it
 * and keeps what each one said, to show when editing.
 */
export function joinExpenses(keep: Expense, others: Expense[], choice: JoinChoice): Expense {
  const all = [keep, ...others];
  const latest = all.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.createdAt > a.createdAt) ? b : a));
  const { account: _, installments: __, ...base } = keep;
  return {
    ...base,
    amount: all.reduce((n, e) => n + e.amount, 0),
    description: choice.description.trim() || keep.description,
    category: choice.category,
    ...(choice.account ? { account: choice.account } : {}),
    date: latest.date,
    createdAt: latest.createdAt,
    parts: all.reduce((n, e) => n + (e.parts && e.parts > 1 ? e.parts : 1), 0),
    source: all.flatMap(sourcesOf).join("\n"),
  };
}

/** True when the joined expenses sit in different accounts, so the person knows only one is kept. */
export function accountsDiffer(expenses: Expense[]): boolean {
  return new Set(expenses.map((e) => e.account ?? "")).size > 1;
}

/**
 * The expenses offered to join with `base`: with nothing typed, those from the
 * day before to the day after, where a split payment or a tip usually is;
 * with a search, any whose name or amount matches. Newest first.
 */
export function joinCandidates(base: Expense, expenses: Expense[], search: string, limit = 40): Expense[] {
  const q = normalize(search);
  const digits = search.replace(/\D/g, "");
  const day = fromISODate(base.date);
  const near = new Set([toISODate(addDays(day, -1)), base.date, toISODate(addDays(day, 1))]);
  return expenses
    .filter((e) => e.id !== base.id)
    .filter((e) => (q ? normalize(e.description).includes(q) || (digits.length >= 2 && String(Math.round(e.amount)).includes(digits)) : near.has(e.date)))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
