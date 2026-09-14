import { describe, expect, it } from "vitest";
import { filterExpenses, summarize } from "./summary";
import type { Expense } from "./types";

const exp = (id: string, amount: number, date: string, account: string | undefined, category: Expense["category"]): Expense => ({
  id, amount, date, account, category, description: id, createdAt: Number(date.replace(/-/g, "")),
});
const items = [
  exp("a", 63000, "2026-10-02", "nequi", "mercado"),
  exp("b", 85000, "2026-10-12", "tc", "mercado"),
  exp("c", 96000, "2026-10-08", "nequi", "comida"),
  exp("d", 42000, "2026-10-18", "tc", "comida"),
  exp("e", 318000, "2026-10-05", "bogota", "deuda"),
];
const isCredit = (a: string | undefined) => a === "tc";

describe("summarize", () => {
  it("splits the credit part of the total and of each category", () => {
    const s = summarize(items, isCredit);
    expect(s.total).toBe(604000);
    expect(s.credit).toBe(127000);
    expect(s.byCategory.map((c) => [c.category, c.total, c.credit])).toEqual([
      ["deuda", 318000, 0],
      ["mercado", 148000, 85000],
      ["comida", 138000, 42000],
    ]);
  });

  it("has no credit part without a credit predicate", () => {
    expect(summarize(items).credit).toBe(0);
  });

  it("filters by range, category and account", () => {
    expect(filterExpenses(items, { from: "2026-10-01", to: "2026-10-10" }).map((e) => e.id)).toEqual(["a", "c", "e"]);
    expect(filterExpenses(items, null, "comida").map((e) => e.id)).toEqual(["c", "d"]);
    expect(filterExpenses(items, null, null, "tc").map((e) => e.id)).toEqual(["b", "d"]);
  });
});
