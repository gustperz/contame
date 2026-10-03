import { describe, expect, it } from "vitest";
import { emptyState, sanitize, type AppState } from "../storage/store";
import { saveInbox } from "../storage/useApp";
import type { Expense, Settings } from "./types";
import { bankOf, expenseIdFor, inboxExpense, merchantKey, mergedExpense, proposeMerge, needsReview, noticeName, propose, purchaseTime, reviewSummary, type InboxItem } from "./inbox";

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
    expect(p).toMatchObject({ description: "Americanino Valledupar", category: "ropa", categoryFrom: "rule", account: "lulo", accountFrom: "card" });
    expect(needsReview(p)).toEqual({ account: false, category: false });
  });

  it("tells the bank from the notice", () => {
    expect(bankOf(item())).toBe("lulo");
    expect(bankOf(item({ notices: [{ kind: "nequi-breb-email", text: "", receivedAt: "" }] }))).toBe("nequi");
    expect(bankOf(item({ notices: [{ kind: "bogota-transfer-email", text: "", receivedAt: "" }] }))).toBe("bogota");
    expect(bankOf(item({ notices: [{ kind: "amazon-email", text: "", receivedAt: "" }] }))).toBeNull();
  });

  it("guesses the category from keywords when there is no rule", () => {
    expect(propose(item({ merchant: "Starbucks Unicentro" }), settings, [])).toMatchObject({ category: "comida", categoryFrom: "guess" });
  });

  it("asks for a look when it does not know the card or the category", () => {
    const davivienda = [{ kind: "davivienda-email", text: "", receivedAt: "" }];
    const p = propose(item({ merchant: "Multicine Unicentro 3", last4: "0198", notices: davivienda }), settings, []);
    expect(p.account).toBeUndefined();
    expect(needsReview(p)).toEqual({ account: true, category: p.categoryFrom === "none" });
    const pse = [{ kind: "pse-email", text: "", receivedAt: "" }];
    expect(needsReview(propose(item({ merchant: "Pago PSE", last4: null, credit: false, notices: pse }), settings, []))).toEqual({ account: true, category: true });
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

  it("names every kind of notice the mailbox reads", () => {
    expect(["pse-email", "nequi-breb-email", "nequi-bill-email", "bogota-transfer-email", "davivienda-email"].map(noticeName)).toEqual([
      "Correo PSE",
      "Correo Nequi",
      "Correo Nequi",
      "Correo Banco de Bogotá",
      "Correo Davivienda",
    ]);
  });

  it("names what was read from a screenshot or photo, and finds its bank", () => {
    expect(noticeName("bogota-foto")).toBe("Captura de Banco de Bogotá, leída por Claude");
    expect(noticeName("foto")).toBe("Captura o foto, leída por Claude");
    expect(bankOf(item({ notices: [{ kind: "nu-foto", text: "", receivedAt: "" }] }))).toBe("nu");
    const nu: Settings = { currency: "COP", accounts: [{ id: "tarjeta-nu", name: "Tarjeta Nu", emoji: "💜", aliases: [], credit: true }] };
    expect(propose(item({ last4: null, credit: true, notices: [{ kind: "nu-foto", text: "", receivedAt: "" }] }), nu, []).account).toBe("tarjeta-nu");
  });

  it("names what the daily Claude review read, and still finds its bank", () => {
    expect(noticeName("nequi-ai")).toBe("Correo Nequi, leído por Claude");
    expect(noticeName("ai")).toBe("Correo leído por Claude");
    expect(bankOf(item({ notices: [{ kind: "bogota-ai", text: "", receivedAt: "" }] }))).toBe("bogota");
    expect(bankOf(item({ notices: [{ kind: "ai", text: "", receivedAt: "" }] }))).toBeNull();
  });

  it("keys merchant rules without case or accents", () => {
    expect(merchantKey("  Panadería  LA  Nueva ")).toBe("panaderia la nueva");
  });

  it("summarises what needs a look", () => {
    const ps = [
      propose(item({ last4: "0198", notices: [{ kind: "davivienda-email", text: "", receivedAt: "" }] }), settings, []),
      propose(item({ merchant: "Zzz" }), settings, []),
      propose(item(), settings, []),
    ];
    expect(reviewSummary(ps)).toBe("2 para revisar: a uno le falta la cuenta y de uno no adiviné la categoría.");
    expect(reviewSummary([ps[0]])).toBe("Uno para revisar: le falta la cuenta.");
    expect(reviewSummary([ps[2]])).toBeNull();
  });
});

describe("placing notices without card digits", () => {
  // Like the person's real setup: no cards assigned, accounts named after their bank.
  const mine: Settings = {
    currency: "COP",
    accounts: [
      { id: "efectivo", name: "Efectivo", emoji: "💵", aliases: [] },
      { id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] },
      { id: "tarjeta-lulo", name: "Tarjeta Lulo", emoji: "💳", aliases: [], credit: true },
      { id: "banco-bogota", name: "Banco Bogotá", emoji: "🏦", aliases: [] },
    ],
  };
  const from = (kind: string, extra: Partial<InboxItem> = {}) =>
    item({ last4: null, credit: false, merchant: "Pago", notices: [{ kind, text: "", receivedAt: "" }], ...extra });

  it("recognises the account by its name when nothing is associated", () => {
    expect(propose(from("nequi-breb-email"), mine, [])).toMatchObject({ account: "nequi", accountFrom: "name" });
    expect(propose(from("bogota-transfer-email"), mine, [])).toMatchObject({ account: "banco-bogota", accountFrom: "name" });
    // A Lulo credit card notice with the card not assigned yet goes to the Lulo credit account.
    expect(propose(item({ last4: "4007", credit: true }), mine, [])).toMatchObject({ account: "tarjeta-lulo", accountFrom: "name" });
    expect(needsReview(propose(from("nequi-breb-email"), mine, [])).account).toBe(false);
  });

  it("leaves PSE and unknown banks for the person to choose", () => {
    expect(propose(from("pse-email"), mine, []).account).toBeUndefined();
    expect(propose(from("davivienda-email", { last4: "0786", credit: true }), mine, []).account).toBeUndefined();
  });

  it("puts a credit notice only on a credit account", () => {
    const debitOnly: Settings = { ...mine, accounts: [{ id: "lulo-cuenta", name: "Cuenta Lulo", emoji: "🏦", aliases: [] }] };
    expect(propose(item({ last4: "4007", credit: true }), debitOnly, []).account).toBeUndefined();
    // A notice that does not say (a text message) takes the account that is there.
    expect(propose(item({ last4: "4007", credit: false }), debitOnly, []).account).toBe("lulo-cuenta");
  });

  it("follows the association the person made, before the name", () => {
    const associated: Settings = { ...mine, accounts: mine.accounts.map((a) => (a.id === "banco-bogota" ? { ...a, sources: ["pse"] } : a)) };
    expect(propose(from("pse-email"), associated, [])).toMatchObject({ account: "banco-bogota", accountFrom: "source" });
    const renamed: Settings = { ...mine, accounts: [...mine.accounts, { id: "ahorros", name: "Ahorros", emoji: "🐷", aliases: [], sources: ["nequi"] }] };
    expect(propose(from("nequi-breb-email"), renamed, [])).toMatchObject({ account: "ahorros", accountFrom: "source" });
  });

  it("prefers an assigned card over the bank", () => {
    const withCard: Settings = { ...mine, accounts: [...mine.accounts, { id: "otra", name: "Otra", emoji: "💳", aliases: [], credit: true, cards: ["4007"] }] };
    expect(propose(item({ last4: "4007", credit: true }), withCard, [])).toMatchObject({ account: "otra", accountFrom: "card" });
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

  it("takes the category from the last time, without storing a rule", () => {
    const a = item({ merchant: "STO 258", last4: "4007" });
    // The description is rewritten; the merchant is kept on the expense.
    const next = saveInbox(
      base(),
      [{ item: a, choice: { description: "Comida para el desayuno", amount: a.amount, category: "comida", account: "bogota" }, rememberCard: true }],
      5,
    );
    expect(next.expenses[0]).toMatchObject({ description: "Comida para el desayuno", merchant: "STO 258", category: "comida" });
    expect(next.settings.merchantCategories).toEqual(settings.merchantCategories);
    expect(next.settings.accounts.find((x) => x.id === "bogota")!.cards).toEqual(["4007"]);
    expect(next.settings.accounts.find((x) => x.id === "lulo")!.cards).toBeUndefined();
    expect(propose(item({ merchant: "sto 258" }), next.settings, next.expenses)).toMatchObject({ category: "comida", categoryFrom: "history" });
  });

  it("follows the latest choice for a merchant, over an old rule too", () => {
    const at = (createdAt: number, category: Expense["category"], extra: Partial<Expense> = {}): Expense => ({
      id: `h${createdAt}`,
      amount: 1,
      category,
      description: "x",
      merchant: "Americanino Valledupar",
      date: "2026-09-01",
      createdAt,
      ...extra,
    });
    // The settings carry an old rule sending this merchant to "ropa".
    expect(propose(item(), settings, [at(1, "regalos"), at(2, "mascotas")])).toMatchObject({ category: "mascotas", categoryFrom: "history" });
    expect(propose(item(), settings, [])).toMatchObject({ category: "ropa", categoryFrom: "rule" });
    // An expense typed by hand with the merchant's name counts too.
    const typed: Expense = { id: "t", amount: 1, category: "salud", description: "Drogueria Alemana", date: "2026-09-01", createdAt: 3 };
    expect(propose(item({ merchant: "DROGUERIA ALEMANA" }), settings, [typed]).category).toBe("salud");
  });

  it("learns which account a bank's notices go to, one per credit type", () => {
    const pse = item({ last4: null, credit: false, merchant: "Pago", notices: [{ kind: "pse-email", text: "", receivedAt: "" }] });
    const once = saveInbox(base(), [{ item: pse, choice: { description: "Pago", amount: pse.amount, category: "casa", account: "bogota" }, rememberSource: true }], 5);
    expect(once.settings.accounts.find((a) => a.id === "bogota")!.sources).toEqual(["pse"]);
    // Choosing another debit account for PSE moves the association there.
    const pse2 = { ...pse, id: "otro" };
    const moved = saveInbox(once, [{ item: pse2, choice: { description: "Pago", amount: pse.amount, category: "casa", account: "efectivo" }, rememberSource: true }], 6);
    expect(moved.settings.accounts.find((a) => a.id === "efectivo")!.sources).toEqual(["pse"]);
    expect(moved.settings.accounts.find((a) => a.id === "bogota")!.sources).toBeUndefined();
    expect(propose({ ...pse, id: "tercero" }, moved.settings, []).account).toBe("efectivo");
  });
});

describe("joining purchases into one expense", () => {
  const nequi = (text: string) => [{ kind: "nequi-breb-email", text, receivedAt: "2026-10-03T14:12:00Z" }];
  const rentA = () => item({ id: "a1", amount: 2000000, merchant: "Bre-B a Ana Pérez", last4: null, credit: false, date: "2026-10-03", time: "09:12", notices: nequi("Enviaste $2.000.000") });
  const rentB = () => item({ id: "b2", amount: 1000000, merchant: "Bre-B a Ana Pérez", last4: null, credit: false, date: "2026-10-03", time: "09:14", notices: nequi("Enviaste $1.000.000") });
  const withNequi: Settings = { ...settings, accounts: [...settings.accounts, { id: "nequi", name: "Nequi", emoji: "📱", aliases: [] }] };

  it("proposes the first one's details and the sum", () => {
    const [a, b] = [rentA(), rentB()];
    const proposals = new Map([b, a].map((i) => [i.id, propose(i, withNequi, [])]));
    expect(proposeMerge([b, a], proposals)).toMatchObject({ description: "Bre-B a Ana Pérez", account: "nequi", amount: 3000000, accountsDiffer: false });
    const card = item({ id: "c3", date: "2026-10-03", time: "10:00" });
    expect(proposeMerge([a, card], new Map([...proposals, [card.id, propose(card, withNequi, [])]])).accountsDiffer).toBe(true);
  });

  it("saves one expense with the sum, the last date and every notice", () => {
    const [a, b] = [rentA(), rentB()];
    const next = saveInbox(sanitize({ ...emptyState(), settings: withNequi }), [{ item: a, merged: [b], choice: { description: "Arriendo octubre", amount: 1, category: "casa", account: "nequi" } }], 5);
    expect(next.expenses).toHaveLength(1);
    expect(next.expenses[0]).toMatchObject({
      id: expenseIdFor(a),
      amount: 3000000,
      description: "Arriendo octubre",
      category: "casa",
      account: "nequi",
      date: "2026-10-03",
      createdAt: purchaseTime(b),
      parts: 2,
      source: "Enviaste $2.000.000\nEnviaste $1.000.000",
      merchant: "Bre-B a Ana Pérez",
    });
    expect(next.messages.at(-1)?.expenseIds).toEqual([expenseIdFor(a)]);
    expect(mergedExpense([b, a], { description: "x", amount: 0, category: "casa" }).id).toBe(expenseIdFor(a));
  });
});
