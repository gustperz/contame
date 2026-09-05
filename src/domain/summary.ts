import type { CategoryId, Expense, ISODate } from "./types";
import { inRange, type DateRange } from "../utils/dates";

export interface CategoryTotal {
  category: CategoryId;
  total: number;
  count: number;
  share: number;
}

export interface AccountTotal {
  account: string;
  total: number;
  count: number;
  share: number;
}

export interface Summary {
  total: number;
  count: number;
  byCategory: CategoryTotal[];
  byAccount: AccountTotal[];
  byDay: Array<{ date: ISODate; total: number }>;
  expenses: Expense[];
}

export function filterExpenses(
  expenses: Expense[],
  range: DateRange | null,
  category: CategoryId | null = null,
  account: string | null = null,
): Expense[] {
  return expenses.filter((e) => inRange(e.date, range) && (!category || e.category === category) && (!account || e.account === account));
}

export function summarize(expenses: Expense[]): Summary {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cats = new Map<CategoryId, { total: number; count: number }>();
  const accts = new Map<string, { total: number; count: number }>();
  const days = new Map<ISODate, number>();
  for (const e of expenses) {
    const c = cats.get(e.category) ?? { total: 0, count: 0 };
    c.total += e.amount;
    c.count += 1;
    cats.set(e.category, c);
    const a = accts.get(e.account ?? "") ?? { total: 0, count: 0 };
    a.total += e.amount;
    a.count += 1;
    accts.set(e.account ?? "", a);
    days.set(e.date, (days.get(e.date) ?? 0) + e.amount);
  }
  const byAccount = [...accts.entries()]
    .map(([account, v]) => ({ account, ...v, share: total > 0 ? v.total / total : 0 }))
    .sort((a, b) => b.total - a.total);
  const byCategory = [...cats.entries()]
    .map(([category, v]) => ({ category, ...v, share: total > 0 ? v.total / total : 0 }))
    .sort((a, b) => b.total - a.total);
  const byDay = [...days.entries()].map(([date, t]) => ({ date, total: t })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    total,
    count: expenses.length,
    byCategory,
    byAccount,
    byDay,
    expenses: [...expenses].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
  };
}
