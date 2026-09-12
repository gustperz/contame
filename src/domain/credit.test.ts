import { describe, expect, it } from "vitest";
import { allocate, spendItems } from "./credit";
import type { Expense, Payment, Settings } from "./types";

const settings: Settings = {
  currency: "COP",
  accounts: [
    { id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] },
    { id: "bogota", name: "Banco de Bogotá", emoji: "🏦", aliases: ["bogota"] },
    { id: "tc", name: "Tarjeta de crédito", emoji: "💳", aliases: ["tarjeta", "tc"], credit: true },
  ],
};
const exp = (id: string, amount: number, date: string, account: string | undefined, extra: Partial<Expense> = {}): Expense => ({
  id, amount, date, account, category: "otros", description: id, createdAt: Number(date.replace(/-/g, "")), ...extra,
});
const pay = (id: string, amount: number, date: string, from?: string): Payment => ({ id, amount, date, toAccount: "tc", fromAccount: from, createdAt: Number(date.replace(/-/g, "")) });

describe("allocate", () => {
  const expenses = [
    exp("mercado", 210000, "2026-09-03", "tc", { category: "mercado" }),
    exp("almuerzo", 18500, "2026-09-10", "nequi", { category: "comida" }),
    exp("gasolina", 90000, "2026-09-10", "tc", { category: "transporte" }),
    exp("tv", 900000, "2026-09-24", "tc", { installments: 12 }),
  ];

  it("keeps everything pending until a payment arrives", () => {
    const a = allocate(settings, expenses, []);
    expect(a.status[0].debt).toBe(1200000);
    expect(a.status[0].pending.map((p) => p.expense.id)).toEqual(["mercado", "gasolina", "tv"]);
    expect(a.totalDebt).toBe(1200000);
  });

  it("covers purchases oldest first and leaves the last one partial", () => {
    const a = allocate(settings, expenses, [pay("p1", 318000, "2026-10-05", "bogota")]);
    const p1 = a.byPayment.get("p1")!;
    expect(p1.covers).toEqual([
      { expenseId: "mercado", amount: 210000 },
      { expenseId: "gasolina", amount: 90000 },
      { expenseId: "tv", amount: 18000 },
    ]);
    expect(p1.debtBefore).toBe(1200000);
    expect(p1.debtAfter).toBe(882000);
    expect(a.byExpense.get("tv")).toMatchObject({ paid: 18000, pending: 882000 });
    expect(a.status[0].debt).toBe(882000);
    expect(a.status[0].pending.map((p) => p.expense.id)).toEqual(["tv"]);
  });

  it("pays the debt that predates the app first, without counting it as spending", () => {
    const s: Settings = { ...settings, accounts: settings.accounts.map((a) => (a.id === "tc" ? { ...a, initialDebt: 380000 } : a)) };
    const a = allocate(s, expenses, [pay("p1", 400000, "2026-10-05")]);
    expect(a.byPayment.get("p1")!.covers).toEqual([
      { expenseId: null, amount: 380000 },
      { expenseId: "mercado", amount: 20000 },
    ]);
    expect(a.status[0].debt).toBe(380000 + 1200000 - 400000);
    const items = spendItems(s, expenses, [pay("p1", 400000, "2026-10-05")]);
    expect(items.filter((i) => i.via).reduce((t, i) => t + i.amount, 0)).toBe(20000);
  });

  it("records a surplus when paying more than what is pending", () => {
    const a = allocate(settings, expenses, [pay("p1", 1500000, "2026-10-05")]);
    expect(a.byPayment.get("p1")!.surplus).toBe(300000);
    expect(a.status[0].debt).toBe(-300000);
    expect(a.totalDebt).toBe(0);
  });
});

describe("spendItems", () => {
  const expenses = [
    exp("mercado", 210000, "2026-09-03", "tc", { category: "mercado" }),
    exp("almuerzo", 18500, "2026-09-10", "nequi", { category: "comida" }),
    exp("tv", 900000, "2026-09-24", "tc"),
  ];

  it("counts direct expenses on their date and credit purchases on the payment date", () => {
    const items = spendItems(settings, expenses, [pay("p1", 300000, "2026-10-05")]);
    expect(items.map((i) => [i.id, i.amount, i.date])).toEqual([
      ["mercado:p1", 210000, "2026-10-05"],
      ["almuerzo", 18500, "2026-09-10"],
      ["tv:p1", 90000, "2026-10-05"],
    ]);
    expect(items[0].category).toBe("mercado");
    expect(items[2].via).toEqual({ paymentId: "p1", expenseId: "tv", original: 900000 });
  });

  it("splits a purchase across two payments", () => {
    const items = spendItems(settings, expenses, [pay("p1", 300000, "2026-10-05"), pay("p2", 100000, "2026-11-05")]);
    expect(items.filter((i) => i.via?.expenseId === "tv").map((i) => [i.amount, i.date])).toEqual([[90000, "2026-10-05"], [100000, "2026-11-05"]]);
  });

  it("leaves pending credit purchases out", () => {
    const items = spendItems(settings, expenses, []);
    expect(items.map((i) => i.id)).toEqual(["almuerzo"]);
  });
});
