import type { ISODate } from "../types";
import { addDays, startOfDay, toISODate, MONTHS_LONG } from "../../utils/dates";

export interface DateMatch {
  date: ISODate;
  start: number;
  end: number;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const MONTHS: Record<string, number> = Object.fromEntries(
  MONTHS_LONG.map((m, i) => [m.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), i]),
);
MONTHS["setiembre"] = 8;

const RELATIVE: Array<[RegExp, (now: Date, m: RegExpMatchArray) => Date]> = [
  [/\b(?:hoy|esta manana|esta tarde|esta noche|ahora|ahorita|hace un rato|hace un momento)\b/, (now) => now],
  [/\b(?:anoche)\b/, (now) => (now.getHours() < 5 ? now : addDays(now, -1))],
  [/\b(?:ayer)\b/, (now) => addDays(now, -1)],
  [/\b(?:antier|anteayer|antes de ayer)\b/, (now) => addDays(now, -2)],
  [/\bhace (\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete) dias?\b/, (now, m) => addDays(now, -smallNumber(m[1]))],
  [/\bhace (una|1) semana\b/, (now) => addDays(now, -7)],
  [/\bhace (\d{1,2}|dos|tres) semanas\b/, (now, m) => addDays(now, -7 * smallNumber(m[1]))],
  [
    /\b(?:el |este |el pasado |pasado )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: pasado| pasada| anterior)?\b/,
    (now, m) => {
      const target = WEEKDAYS[m[1]];
      let back = (now.getDay() - target + 7) % 7;
      if (back === 0 && /pasad|anterior/.test(m[0])) back = 7;
      return addDays(now, -back);
    },
  ],
  [
    /\b(?:el |del )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?\b/,
    (now, m) => {
      const day = Number(m[1]);
      const month = MONTHS[m[2]];
      let year = m[3] ? Number(m[3]) : now.getFullYear();
      let d = new Date(year, month, day);
      if (!m[3] && d > now) d = new Date(year - 1, month, day);
      return d;
    },
  ],
  [
    /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/,
    (now, m) => {
      const day = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (day < 1 || day > 31 || month < 0 || month > 11) return now;
      let year = now.getFullYear();
      if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      let d = new Date(year, month, day);
      if (!m[3] && d > now) d = new Date(year - 1, month, day);
      return d;
    },
  ],
  [
    /\bel (\d{1,2})(?! de | mil|k\b| lucas| pesos|\d|[.,]\d|%)\b/,
    (now, m) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) return now;
      let d = new Date(now.getFullYear(), now.getMonth(), day);
      if (d > now) d = new Date(now.getFullYear(), now.getMonth() - 1, day);
      return d;
    },
  ],
];

function smallNumber(s: string): number {
  const words: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 };
  return words[s] ?? Number(s);
}

/**
 * Finds a date expression in normalized text. Returns null when none is present,
 * meaning "today".
 */
export function findDate(text: string, now: Date = new Date()): DateMatch | null {
  for (const [re, resolve] of RELATIVE) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const d = startOfDay(resolve(now, m));
      return { date: toISODate(d), start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}
