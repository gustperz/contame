import { describe, expect, it } from "vitest";
import { parseMessage, draftFromText } from "./index";
import { parseNumeric, parseAmount } from "./amount";
import { findDate } from "./date";

// Friday, 4 September 2026, 15:00 local.
const NOW = new Date(2026, 8, 4, 15, 0, 0);

function expense(text: string) {
  const r = parseMessage(text, NOW);
  if (r.intent !== "expense") throw new Error(`expected expense, got ${JSON.stringify(r)} for "${text}"`);
  return r.expenses;
}

describe("parseNumeric", () => {
  it("handles separators", () => {
    expect(parseNumeric("15.000")).toBe(15000);
    expect(parseNumeric("1.250.000")).toBe(1250000);
    expect(parseNumeric("15,000")).toBe(15000);
    expect(parseNumeric("15,5")).toBe(15.5);
    expect(parseNumeric("1.5")).toBe(1.5);
    expect(parseNumeric("2.50")).toBe(2.5);
    expect(parseNumeric("15.000,50")).toBe(15000.5);
    expect(parseNumeric("15,000.50")).toBe(15000.5);
    expect(parseNumeric("42")).toBe(42);
  });
});

describe("parseAmount", () => {
  it.each([
    ["15 mil en almuerzo", 15000],
    ["15mil almuerzo", 15000],
    ["15k taxi", 15000],
    ["15.5k taxi", 15500],
    ["$15.000 almuerzo", 15000],
    ["$ 15000 almuerzo", 15000],
    ["almuerzo 15000", 15000],
    ["20 lucas de cerveza", 20000],
    ["2 millones de arriendo", 2000000],
    ["1.5 millones arriendo", 1500000],
    ["2M arriendo", 2000000],
    ["quince mil en almuerzo", 15000],
    ["veinte lucas en cerveza", 20000],
    ["cincuenta mil de mercado", 50000],
    ["mil quinientos de café", 1500],
    ["dos mil quinientos en bus", 2500],
    ["ciento veinte mil en ropa", 120000],
    ["doscientos cincuenta mil arriendo", 250000],
    ["un millón de arriendo", 1000000],
    ["medio millón de arriendo", 500000],
    ["mil de un tinto", 1000],
    ["12 pesos almuerzo", 12],
    ["gasté 12 en almuerzo", 12],
    ["3,50 de café", 3.5],
    ["almuerzo con 2 amigos 30 mil", 30000],
    ["almuerzo con 2 amigos 30000", 30000],
  ])("%s -> %d", (text, expected) => {
    expect(parseAmount(text)?.value).toBe(expected);
  });

  it("returns null when there is no amount", () => {
    expect(parseAmount("almuerzo con un amigo")).toBeNull();
    expect(parseAmount("cuánto llevo hoy")).toBeNull();
    expect(parseAmount("comí a las 3")).not.toBeNull(); // acceptable: bare small number
  });
});

describe("findDate", () => {
  it.each([
    ["ayer 20 mil taxi", "2026-09-03"],
    ["antier almuerzo 20 mil", "2026-09-02"],
    ["hace 3 días 20 mil", "2026-09-01"],
    ["el lunes 20 mil", "2026-08-31"],
    ["el jueves 20 mil", "2026-09-03"],
    ["el viernes 20 mil", "2026-09-04"],
    ["el viernes pasado 20 mil", "2026-08-28"],
    ["el 1 de septiembre 20 mil", "2026-09-01"],
    ["el 25 de diciembre 20 mil", "2025-12-25"],
    ["2/9 20 mil", "2026-09-02"],
    ["el 2 gasté 20 mil", "2026-09-02"],
    ["anoche 20 mil", "2026-09-03"],
  ])("%s -> %s", (text, expected) => {
    expect(findDate(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), NOW)?.date).toBe(expected);
  });

  it("does not treat amounts as dates", () => {
    expect(findDate("el 20 mil de taxi", NOW)).toBeNull();
    expect(findDate("20 mil taxi", NOW)).toBeNull();
  });
});

describe("parseMessage: expenses", () => {
  it("parses a simple expense", () => {
    const [e] = expense("15 mil en almuerzo");
    expect(e).toMatchObject({ amount: 15000, category: "comida", description: "Almuerzo", date: "2026-09-04" });
  });

  it("keeps a meaningful description", () => {
    const [e] = expense("Gasté 35.000 en una hamburguesa con papas en el Corral");
    expect(e.amount).toBe(35000);
    expect(e.category).toBe("comida");
    expect(e.description.toLowerCase()).toContain("hamburguesa");
    expect(e.description.toLowerCase()).toContain("corral");
  });

  it("keeps accents and casing from the original message", () => {
    expect(expense("quince mil en un café")[0].description).toBe("Café");
    expect(expense("Almuerzo en El Corral 35 mil")[0].description).toBe("Almuerzo en El Corral");
    expect(expense("ayer 20k de taxi al aeropuerto")[0].description).toBe("Taxi al aeropuerto");
    expect(expense("pagué 12.500 de la droguería, cosas de aseo")[0].description).toMatch(/droguería/i);
  });

  it("infers categories", () => {
    expect(expense("taxi al aeropuerto 45 mil")[0].category).toBe("transporte");
    expect(expense("mercado en el éxito 180 mil")[0].category).toBe("mercado");
    expect(expense("pagué el arriendo 1.200.000")[0].category).toBe("casa");
    expect(expense("droguería 25k")[0].category).toBe("salud");
    expect(expense("cine con Ana 40 mil")[0].category).toBe("entretenimiento");
    expect(expense("netflix 26.900")[0].category).toBe("suscripciones");
    expect(expense("concentrado para el perro 90 mil")[0].category).toBe("mascotas");
    expect(expense("cosa rara 10 mil")[0].category).toBe("otros");
  });

  it("honours an explicit hashtag", () => {
    const [e] = expense("10 mil #regalos para mamá");
    expect(e.category).toBe("regalos");
    expect(e.description).not.toContain("#");
  });

  it("does not confuse a date's numbers with the amount", () => {
    expect(expense("el 2 de septiembre 30 mil de mercado")[0]).toMatchObject({ amount: 30000, date: "2026-09-02" });
    expect(expense("3/9 taxi 12.000")[0]).toMatchObject({ amount: 12000, date: "2026-09-03" });
  });

  it("applies dates", () => {
    expect(expense("ayer 20 mil de taxi")[0].date).toBe("2026-09-03");
    expect(expense("ayer 20 mil de taxi")[0].description).toBe("Taxi");
    expect(expense("el lunes pagué 50 mil de gasolina")[0].date).toBe("2026-08-31");
  });

  it("splits several expenses in one message", () => {
    const list = expense("almuerzo 20 mil y taxi 8 mil");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ amount: 20000, category: "comida" });
    expect(list[1]).toMatchObject({ amount: 8000, category: "transporte" });
  });

  it("splits on commas and shares the date", () => {
    const list = expense("ayer: café 5 mil, bus 3 mil, cine 30k");
    expect(list.map((e) => e.amount)).toEqual([5000, 3000, 30000]);
    expect(list.every((e) => e.date === "2026-09-03")).toBe(true);
  });

  it("does not split when only one segment has an amount", () => {
    const list = expense("almuerzo con Juan y Pedro 60 mil");
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(60000);
  });

  it("uses the category name when nothing is left for the description", () => {
    const [e] = expense("20 mil");
    expect(e.description).toBe("Otros");
    expect(expense("20k comida")[0].description).toBe("Comida");
  });
});

describe("parseMessage: other intents", () => {
  it("detects queries", () => {
    expect(parseMessage("cuánto llevo hoy", NOW)).toEqual({ intent: "query", period: "today", category: null });
    expect(parseMessage("cuánto he gastado esta semana", NOW)).toMatchObject({ intent: "query", period: "week" });
    expect(parseMessage("resumen del mes", NOW)).toMatchObject({ intent: "query", period: "month" });
    expect(parseMessage("cuánto gasté en comida este mes", NOW)).toMatchObject({ intent: "query", period: "month", category: "comida" });
    expect(parseMessage("cuánto va en transporte", NOW)).toMatchObject({ intent: "query", period: null, category: "transporte" });
    expect(parseMessage("resumen", NOW)).toMatchObject({ intent: "query", period: null });
  });

  it("detects undo and help", () => {
    expect(parseMessage("deshacer", NOW)).toEqual({ intent: "undo" });
    expect(parseMessage("borra el último", NOW)).toEqual({ intent: "undo" });
    expect(parseMessage("elimina el último gasto", NOW)).toEqual({ intent: "undo" });
    expect(parseMessage("ayuda", NOW)).toEqual({ intent: "help" });
  });

  it("detects a bare date as a request to change the working date", () => {
    expect(parseMessage("ayer", NOW)).toEqual({ intent: "setDate", date: "2026-09-03" });
    expect(parseMessage("Gastos de ayer:", NOW)).toEqual({ intent: "setDate", date: "2026-09-03" });
    expect(parseMessage("el lunes", NOW)).toEqual({ intent: "setDate", date: "2026-08-31" });
    expect(parseMessage("2 de septiembre", NOW)).toEqual({ intent: "setDate", date: "2026-09-02" });
    expect(parseMessage("hoy", NOW)).toEqual({ intent: "setDate", date: "2026-09-04" });
    // A date with other words is not a date change.
    expect(parseMessage("ayer almorcé con Ana", NOW)).toEqual({ intent: "unknown", reason: "no-amount" });
  });

  it("uses the default date when the message has none", () => {
    const r = parseMessage("15 mil en almuerzo", NOW, { defaultDate: "2026-09-01" });
    expect(r.intent === "expense" && r.expenses[0].date).toBe("2026-09-01");
    const own = parseMessage("ayer 15 mil en almuerzo", NOW, { defaultDate: "2026-09-01" });
    expect(own.intent === "expense" && own.expenses[0].date).toBe("2026-09-03");
  });

  it("reports messages without an amount", () => {
    expect(parseMessage("almuerzo con un amigo", NOW)).toEqual({ intent: "unknown", reason: "no-amount" });
  });
});

describe("draftFromText", () => {
  it("recovers description, category and date from text without an amount", () => {
    expect(draftFromText("Arepas cena", NOW, "2026-09-01")).toMatchObject({ description: "Arepas cena", category: "comida", date: "2026-09-01" });
    expect(draftFromText("ayer taxi al aeropuerto", NOW)).toMatchObject({ description: "Taxi al aeropuerto", category: "transporte", date: "2026-09-03" });
    expect(draftFromText("cosa rara #regalos", NOW)).toMatchObject({ description: "Cosa rara", category: "regalos", date: "2026-09-04" });
  });
});
