import { describe, expect, it } from "vitest";
import { emptyState, sanitize, type AppState } from "../storage/store";
import { saveInbox } from "../storage/useApp";
import type { Expense, Settings } from "./types";
import { expenseIdFor, inboxExpense, merchantKey, needsReview, propose, purchaseTime, reviewSummary, type InboxItem } from "./inbox";

const settings: Settings = {
  currency: "COP",
  accounts: [
    { id: "efectivo", name: "Efectivo", emoji: "💵", aliases: [] },
    { id: "lulo", name: "Lulo", emoji: "💳", aliases: [], credit: true, cards: ["4007"] },
    { id: "bogota", name: "Bogotá", emoji: "🏦", aliases: [] },
  ],
  merchantCategories: { "americanino valledupar": "ropa" },
};

let n = 0;
function item(extra: Partial<InboxItem> = {}): InboxItem {
  n++;
  return {
    id: `4007|${1000 + n}|2026-09-20|18:0${n % 10}`,
    amount: 1000 + n,
    merchant: "Americanino Valledupar",
    last4: "4007",
    date: "2026-09-20",
    time: "18:01",
    credit: true,
    notices: [{ kind: "lulo-email", text: "Realizaste una compra en AMERICANINO VALLEDUPAR por $1.001", receivedAt: "2026-09-20T23:01:10Z" }],
    ...extra,
  };
}

describe("proposing an expense from a bank notice", () => {
  it("uses the merchant rule and the account of the card", () => {
    const p = propose(item(), settings, []);
    expect(p).toMatchObject({ description: "Americanino Valledupar", category: "ropa", categoryFrom: "rule", account: "lulo", accountFromCard: true });
    expect(needsReview(p)).toEqual({ account: false, category: false });
  });

  it("guesses the category from keywords when there is no rule", () => {
    expect(propose(item({ merchant: "Starbucks Unicentro" }), settings, [])).toMatchObject({ category: "comida", categoryFrom: "guess" });
  });

  it("asks for a look when it does not know the card or the category", () => {
    const p = propose(item({ merchant: "Multicine Unicentro 3", last4: "0198" }), settings, []);
    expect(p.account).toBeUndefined();
    expect(needsReview(p)).toEqual({ account: true, category: p.categoryFrom === "none" });
    expect(needsReview(propose(item({ merchant: "Pago PSE", last4: null }), settings, []))).toEqual({ account: true, category: true });
  });

  it("flags a purchase already noted by hand around the same day", () => {
    const typed: Expense = { id: "x", amount: 90940, category: "ropa", description: "camisa", date: "2026-09-21", createdAt: 1 };
    const p = propose(item({ amount: 90940 }), settings, [typed]);
    expect(p.duplicate?.id).toBe("x");
    expect(propose(item({ amount: 90940, date: "2026-09-25" }), settings, [typed]).duplicate).toBeNull();
    // Another bank expense of the same amount is a different purchase, not a duplicate.
    expect(propose(item({ amount: 90940 }), settings, [{ ...typed, origin: "bank" }]).duplicate).toBeNull();
  });

  it("builds the expense with a stable id, the purchase time and the notice as source", () => {
    const i = item({ time: "18:01" });
    const e = inboxExpense(i, { description: "Americanino", amount: i.amount, category: "ropa", account: "lulo" });
    expect(e).toMatchObject({ id: expenseIdFor(i), description: "Americanino", origin: "bank", account: "lulo", date: "2026-09-20" });
    expect(new Date(e.createdAt).getHours()).toBe(18);
    expect(e.createdAt).toBe(purchaseTime(i));
    expect(e.source).toContain("AMERICANINO");
  });

  it("keys merchant rules without case or accents", () => {
    expect(merchantKey("  Panadería  LA  Nueva ")).toBe("panaderia la nueva");
  });

  it("summarises what needs a look", () => {
    const ps = [
      propose(item({ last4: "0198" }), settings, []),
      propose(item({ merchant: "Zzz" }), settings, []),
      propose(item(), settings, []),
    ];
    expect(reviewSummary(ps)).toBe("2 para revisar: a uno le falta la cuenta y de uno no adiviné la categoría.");
    expect(reviewSummary([ps[0]])).toBe("Uno para revisar: le falta la cuenta.");
    expect(reviewSummary([ps[2]])).toBeNull();
  });
});

describe("saving from the inbox", () => {
  const base = (): AppState => sanitize({ ...emptyState(), settings });

  it("adds the expenses under one chat line", () => {
    const a = item();
    const b = item({ merchant: "Starbucks" });
    const next = saveInbox(base(), [a, b].map((i) => ({ item: i, choice: propose(i, settings, []) })), 5);
    expect(next.expenses.map((e) => e.id)).toEqual([expenseIdFor(a), expenseIdFor(b)]);
    expect(next.messages).toEqual([expect.objectContaining({ kind: "expense", expenseIds: [expenseIdFor(a), expenseIdFor(b)], createdAt: 5 })]);
  });

  it("never saves the same purchase twice", () => {
    const a = item();
    const once = saveInbox(base(), [{ item: a, choice: propose(a, settings, []) }], 5);
    const twice = saveInbox(once, [{ item: a, choice: propose(a, settings, []) }], 6);
    expect(twice.expenses).toHaveLength(1);
    expect(twice.messages).toHaveLength(1);
  });

  it("learns the merchant's category and moves the card to the chosen account", () => {
    const a = item({ merchant: "Multicine Unicentro", last4: "4007" });
    const next = saveInbox(
      base(),
      [{ item: a, choice: { description: "Cine", amount: a.amount, category: "entretenimiento", account: "bogota" }, rememberCategory: true, rememberCard: true }],
      5,
    );
    expect(next.settings.merchantCategories).toMatchObject({ "multicine unicentro": "entretenimiento" });
    expect(next.settings.accounts.find((x) => x.id === "bogota")!.cards).toEqual(["4007"]);
    expect(next.settings.accounts.find((x) => x.id === "lulo")!.cards).toBeUndefined();
    expect(propose(item({ merchant: "MULTICINE unicentro" }), next.settings, []).category).toBe("entretenimiento");
  });
});
