import { describe, expect, it } from "vitest";
import { accountsDiffer, joinCandidates, joinExpenses } from "./merge";
import type { ChatMessage, Expense } from "./types";
import { emptyState } from "../storage/store";
import { joinInState } from "../storage/useApp";

const exp = (id: string, amount: number, date: string, extra: Partial<Expense> = {}): Expense => ({
  id, amount, date, category: "comida", description: id, createdAt: Date.parse(`${date}T12:00:00`) + amount, ...extra,
});
const dinner = exp("Restaurante", 48000, "2026-11-21", { account: "nequi", source: "restaurante 48 mil con nequi", by: "me" });
const tip = exp("Propina", 5000, "2026-11-21", { account: "efectivo", source: "propina 5 mil" });
const taxi = exp("Taxi", 14500, "2026-11-22", { category: "transporte" });
const old = exp("Restaurante viejo", 30000, "2026-10-02");

describe("joining saved expenses", () => {
  it("keeps the opened expense, adds up and remembers what each one said", () => {
    const joined = joinExpenses(dinner, [tip], { description: " Cena ", category: "comida", account: "nequi" });
    expect(joined).toMatchObject({ id: "Restaurante", amount: 53000, description: "Cena", account: "nequi", date: "2026-11-21", parts: 2, by: "me", source: "restaurante 48 mil con nequi\npropina 5 mil" });
  });

  it("takes the latest date, counts earlier joins and names expenses without a message", () => {
    const already = { ...dinner, parts: 2, source: "a\nb" };
    const joined = joinExpenses(already, [taxi], { description: "", category: "otros" });
    expect(joined).toMatchObject({ date: "2026-11-22", createdAt: taxi.createdAt, parts: 3, source: "a\nb\nTaxi", description: "Restaurante", category: "otros" });
    expect(joined.account).toBeUndefined();
  });

  it("says when the expenses sit in different accounts", () => {
    expect(accountsDiffer([dinner, tip])).toBe(true);
    expect(accountsDiffer([dinner, { ...tip, account: "nequi" }])).toBe(false);
  });

  it("offers the nearby days first and anything by searching", () => {
    const all = [dinner, tip, taxi, old];
    expect(joinCandidates(dinner, all, "").map((e) => e.id)).toEqual(["Taxi", "Propina"]);
    expect(joinCandidates(dinner, all, "viejo").map((e) => e.id)).toEqual(["Restaurante viejo"]);
    expect(joinCandidates(dinner, all, "14.500").map((e) => e.id)).toEqual(["Taxi"]);
  });

  it("removes the others and the chat lines that held only them", () => {
    const line = (id: string, ids: string[]): ChatMessage => ({ id, text: id, createdAt: 1, kind: "expense", expenseIds: ids });
    const state = { ...emptyState(), expenses: [dinner, tip, taxi], messages: [line("m1", ["Restaurante"]), line("m2", ["Propina"]), line("m3", ["Propina", "Taxi"])] };
    const next = joinInState(state, "Restaurante", ["Propina"], { description: "Cena", category: "comida", account: "nequi" });
    expect(next.expenses.map((e) => [e.id, e.amount])).toEqual([["Restaurante", 53000], ["Taxi", 14500]]);
    expect(next.messages.map((m) => [m.id, m.expenseIds])).toEqual([["m1", ["Restaurante"]], ["m3", ["Taxi"]]]);
    expect(joinInState(state, "Restaurante", [], { description: "x", category: "comida" })).toBe(state);
  });
});
