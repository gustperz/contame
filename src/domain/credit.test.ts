import { describe, expect, it } from "vitest";
import { cardPaidIn, creditStatus, isCredit, paymentItem, spendItems } from "./credit";
import { propose } from "./inbox";
import { emptyState } from "../storage/store";
import { expenseToPayment, saveInbox } from "../storage/useApp";
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

describe("payments to a card that arrived as expenses", () => {
  const cards: Settings = {
    currency: "COP",
    accounts: [
      { id: "bogota", name: "Banco Bogotá", emoji: "🏦", aliases: ["bogota"] },
      { id: "tarjeta-nu", name: "Tarjeta Nu", emoji: "💳", aliases: ["tarjeta de crédito nu"], credit: true, initialDebt: 1000000 },
      { id: "lulo", name: "Tarjeta Lulo", emoji: "💳", aliases: ["lulo"], credit: true },
    ],
  };
  const paid: Expense = { id: "bank:ai:1", amount: 400000, category: "deuda", description: "Pago tarjeta Nu", date: "2026-11-17", createdAt: 50, account: "bogota", source: "Pago exitoso", origin: "bank", by: "me" };

  it("tells which card a text says was paid, and only when it names one", () => {
    expect(cardPaidIn("Pago tarjeta Nu", cards)).toBe("tarjeta-nu");
    expect(cardPaidIn("Pago tarjete de crédito Nu", cards)).toBe("tarjeta-nu");
    expect(cardPaidIn("pago tc lulo bank", cards)).toBe("lulo");
    expect(cardPaidIn("Pago TC Visa 2033", cards)).toBeUndefined();
    expect(cardPaidIn("Pago crédito Banco de Bogotá", cards)).toBeUndefined();
    expect(cardPaidIn("Compra en Nu Market", cards)).toBeUndefined();
  });

  it("turns the expense into a payment that lowers the debt", () => {
    const state = { ...emptyState(), settings: cards, expenses: [paid], messages: [{ id: "m1", text: "Movimiento de la bandeja", createdAt: 60, kind: "expense" as const, expenseIds: [paid.id] }] };
    expect(creditStatus(cards, state.expenses, state.payments)[0].debt).toBe(1000000);
    const next = expenseToPayment(state, paid, "tarjeta-nu");
    expect(next.expenses).toEqual([]);
    expect(next.payments).toEqual([{ id: "bank:ai:1", amount: 400000, toAccount: "tarjeta-nu", fromAccount: "bogota", date: "2026-11-17", createdAt: 50, source: "Pago exitoso", by: "me" }]);
    expect(next.messages).toMatchObject([{ id: "m1", kind: "payment", paymentId: "bank:ai:1" }]);
    expect(creditStatus(cards, next.expenses, next.payments)[0].debt).toBe(600000);
    expect(expenseToPayment(state, paid, "bogota")).toBe(state);
  });

  it("proposes and saves an inbox movement as a payment to the card", () => {
    const item = { id: "ai:9", amount: 859008, merchant: "Pago tarjeta Nu", last4: null, date: "2026-10-19", time: "10:00", credit: false, notices: [{ kind: "bogota-ai", text: "Pago", receivedAt: "" }] };
    const proposal = propose(item, cards, []);
    expect(proposal).toMatchObject({ payCard: "tarjeta-nu", category: "deuda", account: "bogota" });
    const next = saveInbox({ ...emptyState(), settings: cards }, [{ item, choice: proposal }], 5, "me");
    expect(next.expenses).toEqual([]);
    expect(next.payments).toMatchObject([{ id: "bank:ai:9", amount: 859008, toAccount: "tarjeta-nu", fromAccount: "bogota", by: "me" }]);
    expect(next.messages.at(-1)).toMatchObject({ kind: "payment", paymentId: "bank:ai:9" });
    expect(saveInbox(next, [{ item, choice: proposal }], 6).payments).toHaveLength(1);
  });
});
