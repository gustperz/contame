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
    expect(state.version).toBe(4);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].account).toBeUndefined();
    expect(state.settings.accounts.length).toBeGreaterThan(0);
    expect(state.messages).toEqual([{ id: "u1", text: "15 mil en almuerzo", createdAt: 2, kind: "expense", expenseIds: ["e1"], note: undefined }]);
  });

  it("leaves expenses of unknown accounts without account", () => {
    const state = sanitize({
      version: 4,
      expenses: [{ id: "e1", amount: 1, category: "otros", description: "x", date: "2026-09-04", createdAt: 1, account: "borrada" }],
      messages: [],
      settings: { currency: "COP", accounts: [{ id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] }] },
    } as never);
    expect(state.expenses[0].account).toBeUndefined();
  });

  it("clears the cash account that version 3 assigned by default, keeping other accounts", () => {
    const accounts = [{ id: "efectivo", name: "Efectivo", emoji: "💵", aliases: [] }, { id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] }];
    const state = sanitize({
      version: 3,
      expenses: [
        { id: "e1", amount: 1, category: "otros", description: "x", date: "2026-09-04", createdAt: 1, account: "efectivo" },
        { id: "e2", amount: 1, category: "otros", description: "y", date: "2026-09-04", createdAt: 2, account: "nequi" },
      ],
      messages: [],
      settings: { currency: "COP", accounts, defaultAccount: "efectivo" },
    } as never);
    expect(state.expenses.map((e) => e.account)).toEqual([undefined, "nequi"]);
  });

  it("keeps an optional default account only when it exists", () => {
    const accounts = [{ id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] }];
    const ok = sanitize({ version: 4, expenses: [], messages: [], settings: { currency: "COP", accounts, defaultAccount: "nequi" } } as never);
    expect(ok.settings.defaultAccount).toBe("nequi");
    const gone = sanitize({ version: 4, expenses: [], messages: [], settings: { currency: "COP", accounts, defaultAccount: "borrada" } } as never);
    expect(gone.settings.defaultAccount).toBeUndefined();
  });

  it("allows an empty account list", () => {
    const state = sanitize({ version: 4, expenses: [], messages: [], settings: { currency: "COP", accounts: [] } } as never);
    expect(state.settings.accounts).toEqual([]);
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
