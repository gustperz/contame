import type { ISODate, MonthStarts, Period } from "../domain/types";
import { addDays, fromISODate, MONTHS_LONG, periodLabel, rangeForPeriod, toISODate, type DateRange } from "./dates";

/**
 * Months that start on payday instead of the 1st. Closing September on the
 * 29th stores {"2026-10": "2026-09-29"}: from that day spending counts in
 * October, while every expense keeps its real date. A month missing from
 * the map starts on its 1st, as in the calendar.
 */

/** How far from the 1st a month can start: paydays fall around the end of the month. */
export const CLOSE_WINDOW_DAYS = 10;

const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" for any day of October 2026. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function firstOf(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1, 12);
}

/** The month `n` months after `key` ("2026-12", 1 -> "2027-01"). */
export function shiftMonth(key: string, n: number): string {
  const d = firstOf(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1, 12));
}

/** "octubre". */
export function monthName(key: string): string {
  return MONTHS_LONG[firstOf(key).getMonth()];
}

/** Whether `date` is close enough to the 1st of `key` to start that month. */
function inWindow(key: string, date: ISODate): boolean {
  const first = firstOf(key);
  return date >= toISODate(addDays(first, -CLOSE_WINDOW_DAYS)) && date <= toISODate(addDays(first, CLOSE_WINDOW_DAYS));
}

/** Only well-formed starts near their month's 1st, so months never overlap; omitted when empty. */
export function monthStartsOf(raw: unknown): MonthStarts | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const clean = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, ISODate] => KEY.test(e[0]) && typeof e[1] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e[1]) && inWindow(e[0], e[1]),
    ),
  );
  return Object.keys(clean).length ? clean : undefined;
}

/** The day a month starts: the day the month before was closed, or its 1st. */
export function monthStart(key: string, starts?: MonthStarts): ISODate {
  return starts?.[key] ?? toISODate(firstOf(key));
}

/** The month a day counts in. */
export function monthOf(date: ISODate, starts?: MonthStarts): string {
  const calendar = date.slice(0, 7);
  const next = shiftMonth(calendar, 1);
  if (monthStart(next, starts) <= date) return next;
  if (monthStart(calendar, starts) <= date) return calendar;
  return shiftMonth(calendar, -1);
}

export function monthRange(key: string, starts?: MonthStarts): DateRange {
  return { from: monthStart(key, starts), to: toISODate(addDays(fromISODate(monthStart(shiftMonth(key, 1), starts)), -1)) };
}

/** Like rangeForPeriod, with "month" and "lastMonth" following the closed months. */
export function periodRange(period: Period, now: Date = new Date(), starts?: MonthStarts): DateRange | null {
  if (period !== "month" && period !== "lastMonth") return rangeForPeriod(period, now);
  const current = monthOf(toISODate(now), starts);
  return monthRange(period === "month" ? current : shiftMonth(current, -1), starts);
}

/** Like periodLabel, naming the month spending counts in ("en octubre" on September 30 after closing). */
export function periodLabelFor(period: Period, now: Date = new Date(), starts?: MonthStarts): string {
  if (period !== "month" && period !== "lastMonth") return periodLabel(period, now);
  const current = monthOf(toISODate(now), starts);
  return `en ${monthName(period === "month" ? current : shiftMonth(current, -1))}`;
}

export interface Closing {
  /** The month that ends ("2026-09"). */
  closes: string;
  /** The month that starts ("2026-10"). */
  opens: string;
  /** The day it was closed on, if it already was. */
  start?: ISODate;
  /** Earliest and latest day it can be closed on today. */
  min: ISODate;
  max: ISODate;
}

/**
 * The change of month happening around today, which can be closed or
 * reopened; null mid-month, when there is nothing to close.
 */
export function closingAround(now: Date, starts?: MonthStarts): Closing | null {
  const today = toISODate(now);
  const nearest = monthKey(new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 15 ? 1 : 0), 1, 12));
  const first = firstOf(nearest);
  const min = toISODate(addDays(first, -CLOSE_WINDOW_DAYS));
  const last = toISODate(addDays(first, CLOSE_WINDOW_DAYS));
  if (today < min || today > last) return null;
  const start = starts?.[nearest];
  return { closes: shiftMonth(nearest, -1), opens: nearest, ...(start ? { start } : {}), min, max: today };
}

/** The starts after closing `closing` on `date`, or reopening it when `date` is null. */
export function withStart(starts: MonthStarts | undefined, opens: string, date: ISODate | null): MonthStarts | undefined {
  const next = { ...(starts ?? {}) };
  if (date) next[opens] = date;
  else delete next[opens];
  return Object.keys(next).length ? next : undefined;
}

export interface ClosePreview<T> {
  /** The month that ends, with the spending left in it. */
  closes: { range: DateRange; total: number; count: number };
  /** The month that starts, with the spending already in it. */
  opens: { from: ISODate; total: number; count: number };
  /** What changes month by closing on that day, oldest first. */
  moved: T[];
}

/** How the two months look if `closing` is closed on `date`. */
export function closePreview<T extends { date: ISODate; amount: number; createdAt: number }>(
  items: T[],
  starts: MonthStarts | undefined,
  closing: Closing,
  date: ISODate,
): ClosePreview<T> {
  const next = withStart(starts, closing.opens, date);
  const closes = monthRange(closing.closes, next);
  const opens = monthRange(closing.opens, next);
  const sum = (list: T[]) => ({ total: list.reduce((s, i) => s + i.amount, 0), count: list.length });
  const within = (r: DateRange) => items.filter((i) => i.date >= r.from && i.date <= r.to);
  const moved = items
    .filter((i) => monthOf(i.date, starts) !== monthOf(i.date, next))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  return { closes: { range: closes, ...sum(within(closes)) }, opens: { from: opens.from, ...sum(within(opens)) }, moved };
}
