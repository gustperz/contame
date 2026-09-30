import { describe, expect, it } from "vitest";
import { closePreview, closingAround, monthOf, monthRange, monthStartsOf, periodLabelFor, periodRange, shiftMonth, withStart } from "./months";
import { queryReply } from "../domain/replies";
import type { Expense, Settings } from "../domain/types";

const PAYDAY = { "2026-10": "2026-09-29" };
const at = (iso: string) => new Date(`${iso}T10:00:00`);
const exp = (id: string, amount: number, date: string): Expense => ({ id, amount, date, category: "comida", description: id, createdAt: Date.parse(`${date}T12:00:00`) });

describe("months that start on payday", () => {
  it("follows the calendar when nothing was closed", () => {
    expect(monthOf("2026-09-30")).toBe("2026-09");
    expect(monthOf("2026-10-01")).toBe("2026-10");
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("month", at("2026-09-30"))).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("counts the days after closing in the next month", () => {
    expect(monthOf("2026-09-28", PAYDAY)).toBe("2026-09");
    expect(monthOf("2026-09-29", PAYDAY)).toBe("2026-10");
    expect(monthOf("2026-10-31", PAYDAY)).toBe("2026-10");
    expect(periodRange("month", at("2026-09-30"), PAYDAY)).toEqual({ from: "2026-09-29", to: "2026-10-31" });
    expect(periodRange("lastMonth", at("2026-09-30"), PAYDAY)).toEqual({ from: "2026-09-01", to: "2026-09-28" });
    expect(periodLabelFor("month", at("2026-09-30"), PAYDAY)).toBe("en octubre");
    expect(periodLabelFor("lastMonth", at("2026-09-30"), PAYDAY)).toBe("en septiembre");
  });

  it("can close late, keeping the first days in the month before", () => {
    const late = { "2026-10": "2026-10-02" };
    expect(monthOf("2026-10-01", late)).toBe("2026-09");
    expect(monthRange("2026-09", late)).toEqual({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("wraps around the year", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthOf("2026-12-30", { "2027-01": "2026-12-29" })).toBe("2027-01");
    expect(monthRange("2027-01", { "2027-01": "2026-12-29" })).toEqual({ from: "2026-12-29", to: "2027-01-31" });
  });

  it("keeps only starts near their month's 1st", () => {
    expect(monthStartsOf({ "2026-10": "2026-09-29", "2026-11": "2026-11-20", "2026-13": "2026-12-30", x: "2026-09-29", "2026-12": 5 })).toEqual(PAYDAY);
    expect(monthStartsOf({})).toBeUndefined();
    expect(monthStartsOf(["2026-09-29"])).toBeUndefined();
  });

  it("offers closing only around the change of month", () => {
    expect(closingAround(at("2026-09-15"))).toBeNull();
    expect(closingAround(at("2026-09-30"))).toEqual({ closes: "2026-09", opens: "2026-10", min: "2026-09-21", max: "2026-09-30" });
    expect(closingAround(at("2026-10-03"), PAYDAY)).toEqual({ closes: "2026-09", opens: "2026-10", start: "2026-09-29", min: "2026-09-21", max: "2026-10-03" });
    expect(closingAround(at("2026-10-12"))).toBeNull();
  });

  it("closes and reopens", () => {
    expect(withStart(undefined, "2026-10", "2026-09-29")).toEqual(PAYDAY);
    expect(withStart(PAYDAY, "2026-10", null)).toBeUndefined();
  });

  it("shows what moves to the next month before closing", () => {
    const items = [exp("pizza", 46000, "2026-09-28"), exp("taxi", 11000, "2026-09-30"), exp("mercado", 128500, "2026-09-29")];
    const preview = closePreview(items, undefined, closingAround(at("2026-09-30"))!, "2026-09-29");
    expect(preview.closes).toEqual({ range: { from: "2026-09-01", to: "2026-09-28" }, total: 46000, count: 1 });
    expect(preview.opens).toEqual({ from: "2026-09-29", total: 139500, count: 2 });
    expect(preview.moved.map((i) => i.id)).toEqual(["mercado", "taxi"]);
  });

  it("answers month questions in the chat with the closed months", () => {
    const settings: Settings = { currency: "COP", accounts: [], monthStarts: PAYDAY };
    const items = [exp("pizza", 46000, "2026-09-28"), exp("mercado", 128500, "2026-09-29")];
    const reply = queryReply({ intent: "query", period: "month", category: null, account: null }, items, "COP", at("2026-09-30"), settings);
    expect(reply).toMatch(/^En octubre llevas \$\s?128\.500 en 1 gasto\./);
  });
});
