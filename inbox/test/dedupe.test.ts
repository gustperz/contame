import { describe, expect, it } from "vitest";
import { keyOf, merge } from "../src/dedupe";
import type { Notice, PendingItem, Transaction } from "../src/types";

const purchase = (amount: number, time: string, merchant = "Multicine", last4 = "1234"): Transaction => ({
  amount, merchant, last4, date: "2026-03-04", time, credit: false,
});
const notice = (kind: Notice["kind"], text: string = kind): Notice => ({ kind, text, receivedAt: "2026-03-04T13:00:00.000Z" });
const NOW = "2026-03-04T13:00:00.000Z";

describe("keyOf", () => {
  it("joins notices of one purchase and keeps different purchases apart", () => {
    expect(keyOf(purchase(22000, "18:51"))).toBe(keyOf(purchase(22000, "18:51", "MULTICINE UNICENTRO")));
    expect(keyOf(purchase(22000, "18:51"))).not.toBe(keyOf(purchase(65000, "18:51")));
    expect(keyOf(purchase(22000, "18:51"))).not.toBe(keyOf(purchase(22000, "18:54")));
    expect(keyOf(purchase(22000, "18:51", "Multicine", "5678"))).not.toBe(keyOf(purchase(22000, "18:51")));
  });
});

describe("merge", () => {
  it("creates the item from the first notice that arrives", () => {
    const item = merge(null, purchase(37500, "08:12"), notice("lulo-sms"), NOW);
    expect(item).toMatchObject({ amount: 37500, status: "pending", createdAt: NOW });
    expect(item.notices).toHaveLength(1);
  });

  it("adds the second notice of the same purchase instead of duplicating it", () => {
    const first = merge(null, purchase(37500, "08:12", "Panaderia"), notice("lulo-sms"), NOW);
    const second = merge(first, purchase(37500, "08:12", "Panaderia La Espiga"), notice("lulo-email"), NOW);
    expect(second.id).toBe(first.id);
    expect(second.notices.map((n) => n.kind)).toEqual(["lulo-sms", "lulo-email"]);
    expect(second.merchant).toBe("Panaderia La Espiga");
  });

  it("keeps the credit flag when any notice carries it", () => {
    const first = merge(null, purchase(37500, "08:12"), notice("lulo-sms"), NOW);
    const second = merge(first, { ...purchase(37500, "08:12"), credit: true }, notice("lulo-email"), NOW);
    expect(second.credit).toBe(true);
  });

  it("does not count the same message twice when it is resent", () => {
    const first = merge(null, purchase(37500, "08:12"), notice("lulo-sms", "identical"), NOW);
    const second = merge(first, purchase(37500, "08:12"), notice("lulo-sms", "identical"), NOW);
    expect(second.notices).toHaveLength(1);
  });

  it("never revives what was already saved or discarded", () => {
    const saved: PendingItem = { ...merge(null, purchase(37500, "08:12"), notice("lulo-sms"), NOW), status: "saved" };
    const after = merge(saved, purchase(37500, "08:12"), notice("lulo-email"), NOW);
    expect(after.status).toBe("saved");
    expect(after.notices).toHaveLength(2);
  });

  it("does not join purchases at the same shop for different amounts", () => {
    const ids = [purchase(22000, "18:51"), purchase(65000, "18:54"), purchase(14000, "19:21")].map(keyOf);
    expect(new Set(ids).size).toBe(3);
  });
});
