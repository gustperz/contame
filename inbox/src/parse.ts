import { parseAmount } from "./amount";
import type { SourceKind, Transaction } from "./types";

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Three-letter months as Nequi writes them, which mixes Spanish and English ("Sep", "Ago", "Aug"). */
const SHORT_MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (y: number | string, m: number | string, d: number | string) => `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;

function monthNumber(name: string): number | undefined {
  const n = name.toLowerCase().replace(/\.$/, "");
  return MONTHS[n] ?? SHORT_MONTHS[n.slice(0, 3)];
}

/** "20 de septiembre de 2026" -> "2026-09-20" */
function spelledDate(text: string): string | null {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(text.trim());
  if (!m) return null;
  const month = monthNumber(m[2]);
  if (!month) return null;
  return isoDate(m[3], month, m[1]);
}

/** "6:01 p.m." -> "18:01". Also "7:12 p. m.", with the space Banco de Bogotá puts in. */
function time12h(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const afternoon = m[3].toLowerCase() === "p";
  if (afternoon && h !== 12) h += 12;
  if (!afternoon && h === 12) h = 0;
  return `${pad2(h)}:${m[2]}`;
}

const TIME_12H = "\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s*m\\.?";
/** An amount ends in a digit, so the full stop after "por $41.230." is left out. */
const AMOUNT = "(?<amount>\\d(?:[\\d.,]*\\d)?)";

/** Colombia is UTC-5 all year: no daylight saving time. */
const BOGOTA_OFFSET_MS = -5 * 3_600_000;

/** The time on a Bogotá clock ("HH:MM") for a moment given in milliseconds. */
export function bogotaClock(ms: number): string {
  const d = new Date(ms + BOGOTA_OFFSET_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Drops the shouting caps: "AMERICANINO VALLEDUPAR" -> "Americanino Valledupar" */
function prettyMerchant(merchant: string): string {
  return merchant
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

/** Drops the company type: "COMCEL S.A." -> "COMCEL", "GASES DEL CARIBE S.A ESP" -> "GASES DEL CARIBE". */
function withoutCompanyType(name: string): string {
  const suffix = /(?:^|[\s,]+)(?:S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|E\.?\s?S\.?\s?P\.?|LTDA\.?|S\.?\s?C\.?\s?A\.?)$/i;
  let out = name.trim().replace(/[\s,.]+$/, "");
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(suffix, "").replace(/[\s,.]+$/, "");
  }
  return out || name.trim();
}

/**
 * What the email is beyond its text. The subject tells some templates apart,
 * and the arrival time stands in for the purchase time in notices that only
 * carry the date (PSE, Nequi bills).
 */
export interface NoticeContext {
  subject?: string;
  /** When the email arrived, in milliseconds since the epoch. */
  receivedAt?: number;
}

/**
 * The time for a notice that does not say it: the arrival time on a Bogotá
 * clock. The same email always arrives at the same moment, so the matching
 * key stays stable. Without an arrival time (pasted text) it is midnight.
 */
function arrivalTime(ctx: NoticeContext): string {
  return ctx.receivedAt !== undefined && Number.isFinite(ctx.receivedAt) ? bogotaClock(ctx.receivedAt) : "00:00";
}

/** A purchase, a notice that is known not to be a purchase, or nothing recognisable. */
type Built = Transaction | "ignore" | null;

interface Rule {
  kind: SourceKind;
  pattern: RegExp;
  build: (g: Record<string, string>, ctx: NoticeContext & { text: string }) => Built;
}

/**
 * Messages from the same senders that are not spending: money received, a
 * PSE payment that did not go through. They are dropped without a trace
 * instead of showing up as unreadable.
 */
const NOT_SPENDING = [/Recibiste plata/i, /Transacci[oó]n Rechazada/i];

// The patterns match the banks' own Spanish templates, so their wording stays as is.
const RULES: Rule[] = [
  {
    kind: "lulo-email",
    pattern: new RegExp(
      `Realizaste una compra en (?<merchant>.+?) por \\$?${AMOUNT}` +
        "[\\s\\S]*?Origen (?<source>[^\\n•]*)•\\s*(?<last4>\\d{4})" +
        "[\\s\\S]*?Fecha (?<date>\\d{1,2} de [a-záéíóú]+ de \\d{4})" +
        `[\\s\\S]*?Hora (?<time>${TIME_12H})`,
      "i",
    ),
    build: (g) => fromSpelledDate(g, /cr[eé]dito/i.test(g.source ?? "")),
  },
  {
    kind: "lulo-sms",
    pattern: new RegExp(
      `Compra realizada por \\$?${AMOUNT} en (?<merchant>.+?) ` +
        "con tu tarjeta terminada en\\s+\\*?(?<last4>\\d{4})\\.\\s*" +
        "Fecha (?<date>\\d{1,2} de [a-záéíóú]+ de \\d{4})\\.\\s*" +
        `Hora (?<time>${TIME_12H})`,
      "i",
    ),
    build: (g) => fromSpelledDate(g, false),
  },
  {
    kind: "bogota-sms",
    pattern: new RegExp(
      `Tu compra por \\$?${AMOUNT} fue aprobada con Tarjeta (?<class>[^\\s\\d]+) (?<last4>\\d{4}) ` +
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
        `por valor de \\$?${AMOUNT}`,
      "i",
    ),
    build: (g) => assemble({ ...g, merchant: "Pago PSE", last4: "" }, `${g.y}-${g.m}-${g.d}`, g.hms.slice(0, 5), false),
  },
  {
    // ACH Colombia's email for a payment made through PSE. It carries the date
    // but not the time, so the arrival time stands in for it.
    kind: "pse-email",
    pattern: new RegExp(
      `Valor:\\s*\\$?\\s*${AMOUNT}` +
        "[\\s\\S]*?Empresa:\\s*(?<merchant>.+?)\\s*(?:\\n|Descripci[oó]n:)" +
        "[\\s\\S]*?Fecha de la transacci[oó]n:\\s*(?<d>\\d{1,2})/(?<m>\\d{1,2})/(?<y>\\d{4})",
      "i",
    ),
    build: (g, ctx) =>
      assemble({ ...g, last4: "" }, isoDate(g.y, g.m, g.d), arrivalTime(ctx), false, prettyMerchant(withoutCompanyType(g.merchant))),
  },
  {
    // Money sent from Nequi through Bre-B. "a la 1:58" and "a las 12:27": the article follows the hour.
    kind: "nequi-breb-email",
    pattern: new RegExp(
      `Enviaste de manera exitosa \\$?${AMOUNT} a la llave \\S+ de (?<name>.+?) ` +
        `el (?<date>\\d{1,2} de [a-záéíóú]+ de \\d{4}) a las? (?<time>${TIME_12H})`,
      "i",
    ),
    build: (g) => {
      const date = spelledDate(g.date);
      const time = time12h(g.time);
      if (!date || !time) return null;
      return assemble({ ...g, last4: "" }, date, time, false, `Bre-B a ${prettyMerchant(g.name)}`);
    },
  },
  {
    // A bill paid with Nequi. It carries the date but not the time.
    kind: "nequi-bill-email",
    pattern: new RegExp(
      "(?:Listo tu pago en (?<merchant>[^\\n]+?)\\s*\\n[\\s\\S]*?)?" +
        `Pagaste con Nequi tu factura por \\$?${AMOUNT}` +
        "[\\s\\S]*?Fecha del pago:\\s*(?<d>\\d{1,2})/(?<mon>[a-záéíóú]{3,}\\.?)/(?<y>\\d{4})",
      "i",
    ),
    build: (g, ctx) => {
      if (/Estado:\s*(?!exitos)\S/i.test(ctx.text)) return "ignore";
      const month = monthNumber(g.mon);
      if (!month) return null;
      const merchant = g.merchant ?? /comprobante de pago (.+)$/i.exec(ctx.subject ?? "")?.[1] ?? "Pago con Nequi";
      return assemble({ ...g, last4: "" }, isoDate(g.y, month, g.d), arrivalTime(ctx), false, prettyMerchant(merchant));
    },
  },
  {
    // Banco de Bogotá's transfer receipt. Only transfers to a number (a phone
    // or someone else's account number) count as spending: a Bre-B key such as
    // "@NEQUI..." or "Cuenta de Ahorros No. 5678" is usually the person moving
    // money between their own accounts, so those are left as unreadable for the
    // person to look at rather than turned into expenses.
    kind: "bogota-transfer-email",
    pattern: new RegExp(
      "Fecha y Hora:\\s*(?<when>[^\\n•]+?)\\s*(?:\\n|•)" +
        "[\\s\\S]*?Cuenta Destino:\\s*(?<dest>[^\\n•]+?)\\s*(?:\\n|•)" +
        `[\\s\\S]*?Monto:\\s*\\$?\\s*${AMOUNT}`,
      "i",
    ),
    build: (g, ctx) => {
      if (/Resultado:\s*(?!exitos)\S/i.test(ctx.text)) return "ignore";
      const dest = g.dest.replace(/[\s-]/g, "");
      if (!/^\d{7,}$/.test(dest)) return null;
      const when = transferWhen(g.when);
      if (!when) return null;
      return assemble({ ...g, last4: "" }, when.date, when.time, false, `Transferencia a ${dest}`);
    },
  },
  {
    kind: "davivienda-email",
    pattern: new RegExp(
      "Tarjeta (?<class>Cr[eé]dito|D[eé]bito) terminada en \\**(?<last4>\\d{4})" +
        "[\\s\\S]*?Fecha:\\s*(?<y>\\d{4})/(?<m>\\d{2})/(?<d>\\d{2})\\s*Hora:\\s*(?<hm>\\d{2}:\\d{2})" +
        `[\\s\\S]*?Valor Transacci[oó]n:\\s*\\$?\\s*${AMOUNT}` +
        "[\\s\\S]*?Clase de Movimiento:\\s*(?<movement>[^.\\n]+?)\\s*\\." +
        "[\\s\\S]*?Respuesta:\\s*(?<answer>[^\\s.]+)" +
        "[\\s\\S]*?Lugar de Transacci[oó]n:\\s*(?<merchant>.+?)\\s*(?:Atentamente|$)",
      "i",
    ),
    build: (g) => {
      if (!/^aprobad/i.test(g.answer)) return "ignore";
      // A payment to the card or an advance is not a purchase to confirm.
      if (!/^compra/i.test(g.movement.trim())) return null;
      return assemble(g, isoDate(g.y, g.m, g.d), g.hm, /cr[eé]dito/i.test(g.class));
    },
  },
];

/** "Septiembre 25 del 2026 - 7:12 p. m." or "2026-09-16 10:44:03". */
function transferWhen(text: string): { date: string; time: string } | null {
  const spelled = new RegExp(`^([a-záéíóú]+) (\\d{1,2}) del? (\\d{4})\\s*-\\s*(${TIME_12H})$`, "i").exec(text.trim());
  if (spelled) {
    const month = monthNumber(spelled[1]);
    const time = time12h(spelled[4]);
    return month && time ? { date: isoDate(spelled[3], month, spelled[2]), time } : null;
  }
  const numeric = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(text.trim());
  return numeric ? { date: `${numeric[1]}-${numeric[2]}-${numeric[3]}`, time: numeric[4] } : null;
}

function fromSpelledDate(g: Record<string, string>, credit: boolean): Transaction | null {
  const date = spelledDate(g.date ?? "");
  const time = time12h(g.time ?? "");
  if (!date || !time) return null;
  return assemble(g, date, time, credit);
}

function assemble(g: Record<string, string>, date: string, time: string, credit: boolean, merchant = prettyMerchant(g.merchant ?? "")): Transaction | null {
  const amount = parseAmount(g.amount ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return {
    amount,
    merchant,
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

export type NoticeReading =
  | ({ status: "purchase" } & ParsedNotice)
  /** From a known sender but not spending: money received, a declined payment. */
  | { status: "ignored" }
  /** Matches no template. */
  | { status: "unknown" };

/**
 * Reads a notice: a purchase, something known not to be spending, or
 * nothing recognisable. One-time passcodes, Apple Pay notices and marketing
 * fall in the last group because they match no template.
 */
export function readNotice(text: string, ctx: NoticeContext = {}): NoticeReading {
  if (NOT_SPENDING.some((p) => p.test(ctx.subject ?? "") || p.test(text))) return { status: "ignored" };
  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (!m || !m.groups) continue;
    const built = rule.build(m.groups, { ...ctx, text });
    if (built === "ignore") return { status: "ignored" };
    if (built) return { status: "purchase", kind: rule.kind, transaction: built };
  }
  return { status: "unknown" };
}

/** The purchase in a notice, or null for anything else. */
export function parseNotice(text: string, ctx: NoticeContext = {}): ParsedNotice | null {
  const r = readNotice(text, ctx);
  return r.status === "purchase" ? { kind: r.kind, transaction: r.transaction } : null;
}
