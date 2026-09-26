import { describe, expect, it } from "vitest";
import { keyOf } from "../src/dedupe";
import type { Transaction } from "../src/types";

const purchase = (amount: number, time: string, merchant = "Multicine", last4 = "1234"): Transaction => ({
  amount, merchant, last4, date: "2026-03-04", time, credit: false,
});

describe("keyOf", () => {
  it("joins notices of one purchase and keeps different purchases apart", () => {
    expect(keyOf(purchase(22000, "18:51"))).toBe(keyOf(purchase(22000, "18:51", "MULTICINE UNICENTRO")));
    expect(keyOf(purchase(22000, "18:51"))).not.toBe(keyOf(purchase(65000, "18:51")));
    expect(keyOf(purchase(22000, "18:51"))).not.toBe(keyOf(purchase(22000, "18:54")));
    expect(keyOf(purchase(22000, "18:51", "Multicine", "5678"))).not.toBe(keyOf(purchase(22000, "18:51")));
  });
});
