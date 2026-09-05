import type { ISODate, Period } from "../domain/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based start of week. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface DateRange {
  from: ISODate;
  to: ISODate; // inclusive
}

export function rangeForPeriod(period: Period, now: Date = new Date()): DateRange | null {
  const today = startOfDay(now);
  switch (period) {
    case "today":
      return { from: toISODate(today), to: toISODate(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: toISODate(y), to: toISODate(y) };
    }
    case "week": {
      const s = startOfWeek(today);
      return { from: toISODate(s), to: toISODate(addDays(s, 6)) };
    }
    case "lastWeek": {
      const s = addDays(startOfWeek(today), -7);
      return { from: toISODate(s), to: toISODate(addDays(s, 6)) };
    }
    case "month": {
      const s = startOfMonth(today);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      return { from: toISODate(s), to: toISODate(e) };
    }
    case "lastMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISODate(s), to: toISODate(e) };
    }
    case "all":
      return null;
  }
}

export function inRange(date: ISODate, range: DateRange | null): boolean {
  if (!range) return true;
  return date >= range.from && date <= range.to;
}

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Hoy", "Ayer", "lun 1 sep", "lun 1 sep 2025" */
export function humanDate(iso: ISODate, now: Date = new Date()): string {
  const today = toISODate(now);
  if (iso === today) return "Hoy";
  if (iso === toISODate(addDays(now, -1))) return "Ayer";
  const d = fromISODate(iso);
  const base = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function periodLabel(period: Period, now: Date = new Date()): string {
  switch (period) {
    case "today": return "hoy";
    case "yesterday": return "ayer";
    case "week": return "esta semana";
    case "lastWeek": return "la semana pasada";
    case "month": return `en ${MONTHS_LONG[now.getMonth()]}`;
    case "lastMonth": {
      const m = (now.getMonth() + 11) % 12;
      return `en ${MONTHS_LONG[m]}`;
    }
    case "all": return "en total";
  }
}
