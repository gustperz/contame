import type { Account } from "../types";
import { escapeRegExp, normalize } from "../../utils/text";

export interface AccountMatch {
  id: string;
  start: number;
  end: number;
}

/** Connectors that usually precede an account and can be dropped from the description. */
const LEAD_RE = /(?:\b(?:con|desde|por|en|de|del|la|el|mi|usando|pagado|pague|pago)\s+)+$/;

/**
 * Finds an account mentioned by name or alias ("con nequi", "tarjeta", "@bogota").
 * Longest alias wins so "tarjeta de credito" beats "tarjeta".
 */
export function findAccount(text: string, accounts: Account[]): AccountMatch | null {
  const candidates: Array<{ id: string; alias: string }> = [];
  for (const a of accounts) {
    for (const alias of [normalize(a.name), ...a.aliases.map(normalize)]) {
      if (alias) candidates.push({ id: a.id, alias });
    }
  }
  candidates.sort((x, y) => y.alias.length - x.alias.length);
  for (const { id, alias } of candidates) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])@?${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`, "u");
    const m = re.exec(text);
    if (!m) continue;
    let start = m.index;
    const lead = text.slice(0, start).match(LEAD_RE);
    if (lead) start -= lead[0].length;
    return { id, start, end: m.index + m[0].length };
  }
  return null;
}
