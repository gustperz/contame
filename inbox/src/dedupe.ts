import type { Notice, PendingItem, Transaction } from "./types";

/**
 * The key that recognises two notices as the same purchase: same card, same
 * amount and same purchase time. That time is written inside the message rather
 * than being the arrival time, so the match is exact and needs no tolerance
 * window. Two different purchases of the same amount, on the same card, in the
 * same minute would collapse into one, which is far less likely than losing a
 * purchase to an over-eager window.
 */
export function keyOf(t: Transaction): string {
  return [t.last4 ?? "no-card", Math.round(t.amount), t.date, t.time].join("|");
}

/** Keeps whichever merchant name carries more information. */
function betterMerchant(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

/**
 * Adds a notice to the inbox. When an item with the same key already exists it
 * is enriched rather than duplicated, and one already saved or discarded is
 * never revived: the late notice is only recorded against it.
 */
export function merge(
  existing: PendingItem | null,
  transaction: Transaction,
  notice: Notice,
  now: string,
): PendingItem {
  const id = keyOf(transaction);
  if (!existing) {
    return { id, ...transaction, notices: [notice], status: "pending", createdAt: now, updatedAt: now };
  }
  const known = existing.notices.some((n) => n.kind === notice.kind && n.text === notice.text);
  if (known) return existing;
  return {
    ...existing,
    merchant: betterMerchant(existing.merchant, transaction.merchant),
    credit: existing.credit || transaction.credit,
    notices: [...existing.notices, notice],
    updatedAt: now,
  };
}
