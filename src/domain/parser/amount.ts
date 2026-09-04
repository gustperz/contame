import { normalize } from "../../utils/text";

export interface AmountMatch {
  value: number;
  /** Character offsets in the normalized text. */
  start: number;
  end: number;
  /** Explicit unit ("mil", "k", "lucas"...) or currency sign makes a match more trustworthy. */
  confident: boolean;
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  luca: 1_000,
  lucas: 1_000,
  barra: 1_000,
  barras: 1_000,
  m: 1_000_000,
  millon: 1_000_000,
  millones: 1_000_000,
  palo: 1_000_000,
  palos: 1_000_000,
  kilo: 1_000_000,
  kilos: 1_000_000,
};

const UNIT_WORDS = "k|mil|lucas?|barras?|millon(?:es)?|palos?|kilos?|m";
const CURRENCY_PREFIX = "(?:\\$|cop|usd|eur|mxn|ars|clp|pen|€|us\\$|s/\\.?)";
const CURRENCY_SUFFIX = "(?:pesos|dolares|dólares|euros|soles|bolivianos|reales|lempiras|quetzales|colones|cop|usd|eur)";

/**
 * Digits with optional thousands separators and decimals. We accept both
 * "15.000,50" (es) and "15,000.50" (en) and disambiguate in parseNumeric.
 */
const NUMERIC_RE = new RegExp(
  `(?<![\\p{L}\\d/:,.])(${CURRENCY_PREFIX}\\s*)?(\\d+(?:[.,]\\d+)*)(\\s*)(${UNIT_WORDS})?(?![\\p{L}\\d/:%])(?:\\s*(${CURRENCY_SUFFIX})\\b)?`,
  "giu",
);

/** "15.000" -> 15000, "15,5" -> 15.5, "1.5" -> 1.5, "15,000.50" -> 15000.5 */
export function parseNumeric(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d/.test(s)) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Whichever separator appears last is the decimal one.
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    const cleaned = s.split(thousandsSep).join("").replace(decimalSep, ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);
    const allGroupsOfThree = parts.slice(1).every((p) => p.length === 3);
    if (parts.length > 2 || (allGroupsOfThree && parts[0].length <= 3)) {
      // Thousands separators: 15.000 / 1.250.000 / 15,000
      if (!allGroupsOfThree) return null;
      return Number(parts.join(""));
    }
    // Single separator, not a 3-digit group -> decimal: 15.5 / 15,5 / 2.50
    const n = Number(parts.join("."));
    return Number.isFinite(n) ? n : null;
  }
  return Number(s);
}

// --- Number words ("quince mil", "doscientos cincuenta", "dos millones") ---

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21,
  veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
};
const THOUSANDS = new Set(["mil", "lucas", "luca", "barras", "barra", "k"]);
const MILLIONS = new Set(["millon", "millones", "palo", "palos", "kilo", "kilos"]);

function isNumberWord(w: string): boolean {
  return w in UNITS || w in TENS || w in HUNDREDS || THOUSANDS.has(w) || MILLIONS.has(w) || w === "y" || w === "medio" || w === "media";
}

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** Evaluates a run of number words. Returns null when it does not form a number. */
function evalWords(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawNumber = false;
  let sawScale = false;
  let prev = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "y") {
      if (!(prev in TENS)) return null;
      prev = w;
      continue;
    }
    if (w === "medio" || w === "media") {
      // "medio millón", "mil y medio" is not supported; only leading "medio".
      const next = words[i + 1];
      if (i === 0 && next && (MILLIONS.has(next) || THOUSANDS.has(next))) {
        current = 0.5;
        sawNumber = true;
        prev = w;
        continue;
      }
      return null;
    }
    if (w in UNITS) {
      if (prev in UNITS || prev in TENS) return null;
      current += UNITS[w];
      sawNumber = true;
    } else if (w in TENS) {
      if (prev in UNITS || prev in TENS) return null;
      current += TENS[w];
      sawNumber = true;
    } else if (w in HUNDREDS) {
      if (prev in UNITS || prev in TENS || prev in HUNDREDS) return null;
      current += HUNDREDS[w];
      sawNumber = true;
    } else if (THOUSANDS.has(w)) {
      if (prev && THOUSANDS.has(prev)) return null;
      total += (sawNumber && current !== 0 ? current : 1) * 1000;
      current = 0;
      sawNumber = true;
      sawScale = true;
    } else if (MILLIONS.has(w)) {
      if (prev && (THOUSANDS.has(prev) || MILLIONS.has(prev))) return null;
      total = (total + (sawNumber && current !== 0 ? current : 1)) * 1_000_000;
      current = 0;
      sawNumber = true;
      sawScale = true;
    } else {
      return null;
    }
    prev = w;
  }
  if (!sawNumber) return null;
  // Lone "un"/"una"/"uno" is an article, not an amount.
  if (!sawScale && words.every((w) => w === "un" || w === "una" || w === "uno" || w === "y")) return null;
  return total + current;
}

export function findWordAmounts(text: string): AmountMatch[] {
  const tokens = tokenize(text);
  const out: AmountMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i].word) || tokens[i].word === "y") {
      i++;
      continue;
    }
    // Longest run of number words starting here.
    let j = i;
    while (j < tokens.length && isNumberWord(tokens[j].word)) j++;
    // Trim trailing connectors.
    let k = j;
    while (k > i && (tokens[k - 1].word === "y")) k--;
    let value: number | null = null;
    let endIdx = k;
    // Try the longest span first, then shrink from the right.
    for (let e = k; e > i; e--) {
      const words = tokens.slice(i, e).map((t) => t.word);
      if (words[words.length - 1] === "y") continue;
      value = evalWords(words);
      if (value !== null) {
        endIdx = e;
        break;
      }
    }
    if (value !== null) {
      const words = tokens.slice(i, endIdx).map((t) => t.word);
      const confident = words.some((w) => THOUSANDS.has(w) || MILLIONS.has(w));
      // Ignore tiny bare words like "un", "dos" without a scale unless followed by a currency word.
      const after = tokens[endIdx]?.word ?? "";
      const currencyAfter = /^(pesos|dolares|euros|soles|lucas|barras|reales)$/.test(after);
      if (confident || currencyAfter || value >= 10) {
        out.push({ value, start: tokens[i].start, end: currencyAfter ? tokens[endIdx].end : tokens[endIdx - 1].end, confident: confident || currencyAfter });
      }
    }
    i = Math.max(endIdx, i + 1);
  }
  return out;
}

export function findNumericAmounts(text: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  NUMERIC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMERIC_RE.exec(text))) {
    const [full, currencyPrefix, numberRaw, gap, unitRaw, currencySuffix] = m;
    const base = parseNumeric(numberRaw);
    if (base === null) continue;
    let unit: string | undefined = unitRaw?.toLowerCase();
    let end = m.index + full.length;
    // A bare "m" only counts as "millón" when glued to the number: "2m", "1.5M".
    if (unit === "m" && gap.length > 0) {
      unit = undefined;
      end = m.index + (currencyPrefix?.length ?? 0) + numberRaw.length;
    }
    const multiplier = unit ? UNIT_MULTIPLIERS[unit] ?? 1 : 1;
    const value = base * multiplier;
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({
      value,
      start: m.index,
      end,
      confident: Boolean(currencyPrefix || unit || currencySuffix),
    });
  }
  return out;
}

export function findAmounts(text: string): AmountMatch[] {
  const numeric = findNumericAmounts(text);
  const words = findWordAmounts(text).filter(
    (w) => !numeric.some((n) => n.start < w.end && w.start < n.end),
  );
  return [...numeric, ...words].sort((a, b) => a.start - b.start);
}

/** The most plausible amount in a message: explicit units win, then bigger numbers. */
export function pickAmount(matches: AmountMatch[]): AmountMatch | null {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort((a, b) => {
    if (a.confident !== b.confident) return a.confident ? -1 : 1;
    return b.value - a.value;
  });
  return sorted[0];
}

export function parseAmount(text: string): AmountMatch | null {
  return pickAmount(findAmounts(normalize(text)));
}
