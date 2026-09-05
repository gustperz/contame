import { describe, expect, it } from "vitest";
import { migrateMessages, sanitize } from "./store";

describe("migrateMessages", () => {
  it("folds v1 user/app pairs into single lines", () => {
    const v1 = [
      { id: "w", role: "app" as const, text: "¡Hola!", createdAt: 1, kind: "info" },
      { id: "u1", role: "user" as const, text: "15 mil en almuerzo", createdAt: 2 },
      { id: "a1", role: "app" as const, text: "Listo, anoté...", createdAt: 3, kind: "expense", expenseIds: ["e1"] },
      { id: "u2", role: "user" as const, text: "cuánto llevo hoy", createdAt: 4 },
      { id: "a2", role: "app" as const, text: "Hoy llevas $15.000", createdAt: 5, kind: "query" },
      { id: "u3", role: "user" as const, text: "almuerzo con un amigo", createdAt: 6 },
      { id: "a3", role: "app" as const, text: "No encontré el monto", createdAt: 7, kind: "error" },
      { id: "u4", role: "user" as const, text: "deshacer", createdAt: 8 },
      { id: "a4", role: "app" as const, text: "Eliminé...", createdAt: 9, kind: "undo" },
    ];
    const out = migrateMessages(v1);
    expect(out.map((m) => m.id)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(out[0]).toMatchObject({ kind: "expense", expenseIds: ["e1"] });
    expect(out[1]).toMatchObject({ kind: "query", note: "Hoy llevas $15.000" });
    expect(out[2]).toMatchObject({ kind: "plain" });
    expect(out[3]).toMatchObject({ kind: "undo", note: "Eliminé..." });
  });

  it("sanitize migrates version 1 state and keeps expenses", () => {
    const state = sanitize({
      version: 1,
      expenses: [{ id: "e1", amount: 15000, category: "comida", description: "Almuerzo", date: "2026-09-04", createdAt: 2 }],
      messages: [
        { id: "u1", role: "user", text: "15 mil en almuerzo", createdAt: 2 },
        { id: "a1", role: "app", text: "Listo", createdAt: 3, kind: "expense", expenseIds: ["e1"] },
      ],
    } as never);
    expect(state.version).toBe(3);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].account).toBe("efectivo");
    expect(state.settings.accounts.length).toBeGreaterThan(0);
    expect(state.settings.defaultAccount).toBe("efectivo");
    expect(state.messages).toEqual([{ id: "u1", text: "15 mil en almuerzo", createdAt: 2, kind: "expense", expenseIds: ["e1"], note: undefined }]);
  });

  it("moves expenses of unknown accounts to the default one", () => {
    const state = sanitize({
      version: 3,
      expenses: [{ id: "e1", amount: 1, category: "otros", description: "x", date: "2026-09-04", createdAt: 1, account: "borrada" }],
      messages: [],
      settings: { currency: "COP", accounts: [{ id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] }], defaultAccount: "nequi" },
    } as never);
    expect(state.expenses[0].account).toBe("nequi");
  });

  it("keeps version 2 messages as they are", () => {
    const state = sanitize({
      version: 2,
      expenses: [],
      messages: [{ id: "m", text: "hola", createdAt: 1, kind: "plain" }],
    } as never);
    expect(state.messages[0]).toMatchObject({ kind: "plain", text: "hola" });
  });
});
