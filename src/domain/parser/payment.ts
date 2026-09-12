import type { Account } from "../types";
import { escapeRegExp, normalize } from "../../utils/text";

export interface PaymentMatch {
  /** Credit account being paid. */
  toAccount: string;
  start: number;
  end: number;
}

const VERBS = "pague|pago|pagar|pagando|pagos?|abone|abono|abonar|abonarle|abonando|abonos?|cuotas?|cancele|cancelar";
const LINK = "(?:\\s+(?:de|del|a|al|para|el|la|mi|una|un|las|los))*";
const GENERIC = ["tarjeta", "tc", "credito", "tarjeta de credito"];

/**
 * "pagué la tarjeta", "abono a la visa", "cuota de la tc": a payment TO a credit
 * account, as opposed to "pagué con tarjeta" (an expense paid with the card).
 */
export function findPayment(text: string, accounts: Account[]): PaymentMatch | null {
  const credit = accounts.filter((a) => a.credit);
  if (credit.length === 0) return null;
  const candidates: Array<{ id: string; alias: string }> = [];
  for (const a of credit) for (const alias of [normalize(a.name), ...a.aliases.map(normalize)]) if (alias) candidates.push({ id: a.id, alias });
  // A single credit card can also be named generically.
  if (credit.length === 1) for (const g of GENERIC) if (!candidates.some((c) => c.alias === g)) candidates.push({ id: credit[0].id, alias: g });
  candidates.sort((x, y) => y.alias.length - x.alias.length);
  // "12 cuotas tarjeta" is a purchase in installments, not a payment.
  const inst = findInstallments(text);
  for (const { id, alias } of candidates) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VERBS})${LINK}\\s+@?${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`, "gu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      if (inst && start < inst.end && inst.start < start + m[0].length) continue;
      return { toAccount: id, start, end: start + m[0].length };
    }
  }
  return null;
}

export interface InstallmentsMatch {
  count: number;
  start: number;
  end: number;
}

/** "a 12 cuotas", "en 6 cuotas", "12 cuotas" */
export function findInstallments(text: string): InstallmentsMatch | null {
  const m = /(?:\b(?:a|en)\s+)?\b(\d{1,2})\s*cuotas?\b/u.exec(text);
  if (!m) return null;
  const count = Number(m[1]);
  if (count < 1 || count > 60) return null;
  return { count, start: m.index, end: m.index + m[0].length };
}
