import type { Transaction } from "./types";

/**
 * The key that recognises two notices as the same purchase: same card, same
 * amount and same purchase time. That time is written inside the message rather
 * than being the arrival time, so the match is exact and needs no tolerance
 * window. Two different purchases of the same amount, on the same card, in the
 * same minute would collapse into one, which is far less likely than losing a
 * purchase to an over-eager window. The database joins notices by this key
 * (see receive_notice in supabase/migrations).
 */
export function keyOf(t: Transaction): string {
  return [t.last4 ?? "no-card", Math.round(t.amount), t.date, t.time].join("|");
}
