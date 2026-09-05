import type { CategoryId, ExpenseDraft, ISODate, ParsedMessage, Period } from "../types";
import { CATEGORIES } from "../categories";
import { normalize, normalizeAligned, capitalize } from "../../utils/text";
import { toISODate } from "../../utils/dates";
import { findAmounts, pickAmount, type AmountMatch } from "./amount";
import { findDate } from "./date";
import { findCategory } from "./category";

export { findAmounts, parseAmount } from "./amount";
export { findDate } from "./date";
export { findCategory } from "./category";

const RELATIVE_DAY_RE = /\b(?:hoy|ayer|antier|anteayer|anoche)\b/i;
const HELP_RE = /^(?:\/?ayuda|help|\?|como funciona|que puedo decir|instrucciones)[?!. ]*$/;
const UNDO_RE = /^(?:deshacer|deshaz|undo|(?:borra|borrar|elimina|eliminar|quita|quitar|cancela|cancelar)(?: el| la| ese| esa)?(?: ultimo| ultima| anterior| ese gasto| esa)?(?: gasto| registro| movimiento)?)[?!. ]*$/;
const QUERY_RE = /\b(?:cuanto|cuantos|resumen|total|balance|llevo|gastado|gaste|he gastado|va el|van|como voy|como vamos|que he gastado|en que|estadisticas|reporte)\b/;

const PERIOD_PATTERNS: Array<[RegExp, Period]> = [
  [/\b(?:hoy|el dia de hoy|este dia)\b/, "today"],
  [/\bayer\b/, "yesterday"],
  [/\b(?:la )?semana pasada\b|\bsemana anterior\b|\bultima semana\b/, "lastWeek"],
  [/\b(?:esta semana|la semana|en la semana|semanal)\b/, "week"],
  [/\b(?:el )?mes pasado\b|\bmes anterior\b|\bultimo mes\b/, "lastMonth"],
  [/\b(?:este mes|el mes|en el mes|del mes|mensual)\b/, "month"],
  [/\b(?:en total|todo|historico|desde siempre|siempre|acumulado)\b/, "all"],
];

const CATEGORY_NAMES: Array<[string, CategoryId]> = CATEGORIES.flatMap((c) => [
  [normalize(c.name), c.id] as [string, CategoryId],
  [c.id, c.id] as [string, CategoryId],
]);

function findPeriod(text: string): Period | null {
  for (const [re, p] of PERIOD_PATTERNS) if (re.test(text)) return p;
  return null;
}

function findQueryCategory(text: string): CategoryId | null {
  const m = text.match(/\b(?:en|de|para) ([\p{L}]+)\b/u) ?? text.match(/#([\p{L}]+)/u);
  const candidates = m ? [m[1]] : [];
  for (const w of candidates) {
    const hit = CATEGORY_NAMES.find(([name]) => name === w);
    if (hit) return hit[1];
  }
  // Fall back to keyword inference, but only when it is not "otros".
  const inferred = findCategory(text).category;
  return inferred === "otros" ? null : inferred;
}

const LEADING_FILLERS = new Set([
  "gaste", "pague", "compre", "me", "hoy", "fueron", "fue", "son", "de", "del", "en", "el", "la", "un", "una",
  "por", "para", "al", "a", "y", "con", "que", "lo", "se", "le", "pesos", "dolares", "euros", "soles", "plata",
  "dinero", "aprox", "como", "casi", "total", "precio", "costo", "e",
]);
const TRAILING_FILLERS = new Set([...LEADING_FILLERS, "en", "de", "del", "por", "para", "al", "a", "y", "con", "e"]);

/** Cleans leftover text into a readable description, keeping the user's accents and casing. */
function cleanDescription(text: string): string {
  const words = text
    .replace(/[#$€]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[,;:.!?¡¿()"']+|[,;:.!?¡¿()"']+$/g, ""))
    .filter((w) => w.length > 0);
  const key = (w: string) => normalize(w);
  while (words.length && LEADING_FILLERS.has(key(words[0]))) words.shift();
  while (words.length && TRAILING_FILLERS.has(key(words[words.length - 1]))) words.pop();
  return capitalize(words.join(" "));
}

function buildDraft(
  segment: string,
  original: string,
  amount: AmountMatch,
  date: ISODate,
  dateSpan: { start: number; end: number } | null,
  source: string,
): ExpenseDraft {
  const cat = findCategory(segment);
  const spans = [{ start: amount.start, end: amount.end }];
  if (dateSpan) spans.push(dateSpan);
  if (cat.tag) spans.push(cat.tag);
  // Blank out spans in the original text (offsets are aligned) then clean.
  const chars = original.split("");
  for (const sp of spans) for (let i = sp.start; i < sp.end && i < chars.length; i++) chars[i] = " ";
  let desc = cleanDescription(chars.join(""));
  if (!desc) desc = CATEGORIES.find((c) => c.id === cat.category)?.name ?? "Gasto";
  return { amount: amount.value, category: cat.category, description: desc, date, source };
}

interface Segment {
  text: string;
  offset: number;
}

/**
 * Splits "almuerzo 20 mil y taxi 8 mil" into segments when more than one
 * segment carries its own amount. Otherwise returns the whole text.
 */
function splitSegments(text: string): Segment[] {
  const parts: Segment[] = [];
  const re = /\s*(?:,|;|\by\b|\btambien\b|\bademas\b|\bluego\b|\bdespues\b|\bmas\b|\+|\n)\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), offset: last });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) parts.push({ text: text.slice(last), offset: last });
  const withAmounts = parts.filter((p) => findAmounts(p.text).length > 0);
  return withAmounts.length > 1 ? parts : [{ text, offset: 0 }];
}

export interface ParseOptions {
  /** Date used for expenses that do not mention one. Defaults to today. */
  defaultDate?: ISODate;
}

/** Words that may surround a bare date when the user only wants to change the working date. */
const DATE_ONLY_FILLER_RE = /\b(?:gastos?|registrar|registro|anotar|apuntar|para|de|del|fecha|dia|el|lo|los|que|olvide|se me olvido|me falto)\b|[:.,!¡]/g;

/** "ayer", "gastos de ayer:", "el lunes" -> the user wants to keep writing on that date. */
function detectDateOnly(text: string, now: Date): ISODate | null {
  const date = findDate(text, now);
  if (!date) return null;
  const rest = (text.slice(0, date.start) + " " + text.slice(date.end)).replace(DATE_ONLY_FILLER_RE, " ").trim();
  return rest === "" ? date.date : null;
}

/** Amounts in `text`, ignoring numbers that belong to a date expression ("2 de septiembre", "3/9"). */
function amountsOutsideDate(text: string, date: { start: number; end: number } | null): AmountMatch[] {
  const all = findAmounts(text);
  if (!date) return all;
  return all.filter((a) => a.end <= date.start || a.start >= date.end);
}

export function parseMessage(raw: string, now: Date = new Date(), options: ParseOptions = {}): ParsedMessage {
  const original = raw.replace(/\s+/g, " ").trim();
  const text = normalizeAligned(original);
  if (!text) return { intent: "unknown", reason: "no-amount" };
  if (HELP_RE.test(text)) return { intent: "help" };
  if (UNDO_RE.test(text)) return { intent: "undo" };

  // A date mentioned anywhere applies to every segment unless a segment has its own.
  const globalDate = findDate(text, now);
  const globalAmounts = amountsOutsideDate(text, globalDate);
  if (globalAmounts.length === 0) {
    const dateOnly = detectDateOnly(text, now);
    if (dateOnly) return { intent: "setDate", date: dateOnly };
  }
  const looksLikeQuery = QUERY_RE.test(text) && !/\b(?:gaste|pague|compre)\b.*\d|\d.*\b(?:en|de)\b/.test(text);
  if (globalAmounts.length === 0 || (looksLikeQuery && globalAmounts.every((a) => !a.confident))) {
    if (QUERY_RE.test(text) || /^(?:resumen|total|balance)/.test(text)) {
      return { intent: "query", period: findPeriod(text), category: findQueryCategory(text) };
    }
    return { intent: "unknown", reason: "no-amount" };
  }

  const today = options.defaultDate ?? toISODate(now);
  const segments = splitSegments(text);
  const drafts: ExpenseDraft[] = [];

  for (const seg of segments) {
    const localDate = findDate(seg.text, now);
    const amount = pickAmount(amountsOutsideDate(seg.text, localDate));
    if (!amount) {
      // A segment without an amount is descriptive context; attach it to the previous draft.
      const prev = drafts[drafts.length - 1];
      if (prev && segments.length > 1) {
        const segOriginal = original.slice(seg.offset, seg.offset + seg.text.length);
        const extra = cleanDescription(segOriginal.replace(RELATIVE_DAY_RE, " "));
        if (extra && prev.description !== extra) prev.description = `${prev.description} ${extra.toLowerCase()}`.trim();
      }
      continue;
    }
    const date = localDate?.date ?? globalDate?.date ?? today;
    const dateSpan = localDate ? { start: localDate.start, end: localDate.end } : null;
    const segOriginal = original.slice(seg.offset, seg.offset + seg.text.length);
    drafts.push(buildDraft(seg.text, segOriginal, amount, date, dateSpan, original));
  }

  if (drafts.length === 0) return { intent: "unknown", reason: "no-amount" };

  // When a single message describes one expense, the whole text is the source and any
  // leftover amounts (e.g. "2 amigos") stay in the description.
  return { intent: "expense", expenses: drafts };
}
