import { parseAmount } from "./amount";
import type { SourceKind, Transaction } from "./types";

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "20 de septiembre de 2026" -> "2026-09-20" */
function spelledDate(text: string): string | null {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(text.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${pad2(month)}-${pad2(Number(m[1]))}`;
}

/** "6:01 p.m." -> "18:01" */
function time12h(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const afternoon = m[3].toLowerCase() === "p";
  if (afternoon && h !== 12) h += 12;
  if (!afternoon && h === 12) h = 0;
  return `${pad2(h)}:${m[2]}`;
}

/** Drops the shouting caps: "AMERICANINO VALLEDUPAR" -> "Americanino Valledupar" */
function prettyMerchant(merchant: string): string {
  return merchant
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

interface Rule {
  kind: SourceKind;
  pattern: RegExp;
  build: (g: Record<string, string>) => Transaction | null;
}

// The patterns match the banks' own Spanish templates, so their wording stays as is.
const RULES: Rule[] = [
  {
    kind: "lulo-email",
    pattern: new RegExp(
      "Realizaste una compra en (?<merchant>.+?) por \\$?(?<amount>[\\d.,]+)" +
        "[\\s\\S]*?Origen (?<source>[^\\n•]*)•\\s*(?<last4>\\d{4})" +
        "[\\s\\S]*?Fecha (?<date>\\d{1,2} de [a-záéíóú]+ de \\d{4})" +
        "[\\s\\S]*?Hora (?<time>\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s*m\\.?)",
      "i",
    ),
    build: (g) => fromSpelledDate(g, /cr[eé]dito/i.test(g.source ?? "")),
  },
  {
    kind: "lulo-sms",
    pattern: new RegExp(
      "Compra realizada por \\$?(?<amount>[\\d.,]+) en (?<merchant>.+?) " +
        "con tu tarjeta terminada en\\s+\\*?(?<last4>\\d{4})\\.\\s*" +
        "Fecha (?<date>\\d{1,2} de [a-záéíóú]+ de \\d{4})\\.\\s*" +
        "Hora (?<time>\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s*m\\.?)",
      "i",
    ),
    build: (g) => fromSpelledDate(g, false),
  },
  {
    kind: "bogota-sms",
    pattern: new RegExp(
      "Tu compra por \\$?(?<amount>[\\d.,]+) fue aprobada con Tarjeta (?<class>[^\\s\\d]+) (?<last4>\\d{4}) " +
        "el (?<d>\\d{2})/(?<m>\\d{2})/(?<y>\\d{2,4}) (?<hms>\\d{2}:\\d{2}(?::\\d{2})?) en (?<merchant>.+?)(?:\\s*¿|\\s*\\.\\.\\.|$)",
      "i",
    ),
    build: (g) => {
      const y = Number(g.y);
      return assemble(g, `${y < 100 ? 2000 + y : y}-${g.m}-${g.d}`, g.hms.slice(0, 5), /cr[eé]dito/i.test(g.class ?? ""));
    },
  },
  {
    kind: "bogota-pse",
    pattern: new RegExp(
      "Tu pago por PSE fue aprobado el (?<y>\\d{4})/(?<m>\\d{2})/(?<d>\\d{2}) (?<hms>\\d{2}:\\d{2}(?::\\d{2})?) " +
        "por valor de \\$?(?<amount>[\\d.,]+)",
      "i",
    ),
    build: (g) => assemble({ ...g, merchant: "Pago PSE", last4: "" }, `${g.y}-${g.m}-${g.d}`, g.hms.slice(0, 5), false),
  },
];

function fromSpelledDate(g: Record<string, string>, credit: boolean): Transaction | null {
  const date = spelledDate(g.date ?? "");
  const time = time12h(g.time ?? "");
  if (!date || !time) return null;
  return assemble(g, date, time, credit);
}

function assemble(g: Record<string, string>, date: string, time: string, credit: boolean): Transaction | null {
  const amount = parseAmount(g.amount ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return {
    amount,
    merchant: prettyMerchant(g.merchant ?? ""),
    last4: g.last4 ? g.last4 : null,
    date,
    time,
    credit,
  };
}

export interface ParsedNotice {
  kind: SourceKind;
  transaction: Transaction;
}

/**
 * Recognises a purchase notice and turns it into a transaction. Returns null
 * for everything else, which is how one-time passcodes, Apple Pay notices and
 * marketing are dropped: they match no template.
 */
export function parseNotice(text: string): ParsedNotice | null {
  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (!m || !m.groups) continue;
    const transaction = rule.build(m.groups);
    if (transaction) return { kind: rule.kind, transaction };
  }
  return null;
}
