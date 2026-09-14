import { describe, expect, it } from "vitest";
import { creditStatus, isCredit, paymentItem, spendItems } from "./credit";
import type { Expense, Payment, Settings } from "./types";

const settings: Settings = {
  currency: "COP",
  accounts: [
    { id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] },
    { id: "bogota", name: "Banco de Bogotá", emoji: "🏦", aliases: ["bogota"] },
    { id: "tc", name: "Visa", emoji: "💳", aliases: ["tarjeta", "tc"], credit: true },
  ],
};
const exp = (id: string, amount: number, date: string, account: string | undefined, extra: Partial<Expense> = {}): Expense => ({
  id, amount, date, account, category: "otros", description: id, createdAt: Number(date.replace(/-/g, "")), ...extra,
});
const pay = (id: string, amount: number, date: string, from?: string): Payment => ({ id, amount, date, toAccount: "tc", fromAccount: from, createdAt: Number(date.replace(/-/g, "")) });

const expenses = [
  exp("mercado", 210000, "2026-09-03", "tc", { category: "mercado" }),
  exp("almuerzo", 18500, "2026-09-10", "nequi", { category: "comida" }),
  exp("tv", 900000, "2026-09-24", "tc", { installments: 12 }),
];

describe("isCredit", () => {
  it("tells credit accounts apart", () => {
    expect(isCredit(settings, "tc")).toBe(true);
    expect(isCredit(settings, "nequi")).toBe(false);
    expect(isCredit(settings, undefined)).toBe(false);
  });
});

describe("spendItems", () => {
  it("counts every purchase on its own date, credit or not", () => {
    const items = spendItems(settings, expenses, []);
    expect(items.map((i) => [i.id, i.amount, i.date])).toEqual([
      ["mercado", 210000, "2026-09-03"],
      ["almuerzo", 18500, "2026-09-10"],
      ["tv", 900000, "2026-09-24"],
    ]);
  });

  it("adds a card payment as a Deuda expense from the source account", () => {
    const p = pay("p1", 318000, "2026-10-05", "bogota");
    const items = spendItems(settings, expenses, [p]);
    expect(items).toHaveLength(4);
    expect(items[3]).toMatchObject({ id: "p1", amount: 318000, category: "deuda", account: "bogota", date: "2026-10-05", description: "Pago 💳 Visa", payment: p });
    expect(paymentItem(settings, pay("p2", 1000, "2026-10-06")).account).toBeUndefined();
  });
});

describe("creditStatus", () => {
  it("owes what was bought minus what was paid", () => {
    const [s] = creditStatus(settings, expenses, [pay("p1", 318000, "2026-10-05", "bogota")]);
    expect(s).toMatchObject({ initialDebt: 0, purchases: 1110000, payments: 318000, debt: 792000 });
    expect(s.account.id).toBe("tc");
  });

  it("starts from the debt that predates the app", () => {
    const withInitial: Settings = { ...settings, accounts: settings.accounts.map((a) => (a.id === "tc" ? { ...a, initialDebt: 380000 } : a)) };
    const [s] = creditStatus(withInitial, expenses, [pay("p1", 1500000, "2026-10-05")]);
    expect(s.debt).toBe(380000 + 1110000 - 1500000);
  });

  it("lists only credit accounts", () => {
    expect(creditStatus({ ...settings, accounts: settings.accounts.filter((a) => !a.credit) }, expenses, [])).toEqual([]);
  });
});
