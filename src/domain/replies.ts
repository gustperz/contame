import type { CategoryId, Expense, ParsedMessage, Period, Settings } from "./types";
import { accountLabel } from "./accounts";
import { categoryOf } from "./categories";
import { formatMoney } from "../utils/money";
import { periodLabel, rangeForPeriod } from "../utils/dates";
import { filterExpenses, summarize } from "./summary";

export const HELP_TEXT = `Escribe lo que gastaste y aparece como una tarjeta. Ejemplos:

• "15 mil en almuerzo"
• "ayer 20k de taxi"
• "quince mil en un café y 8 mil en bus"
• "netflix 26.900 #suscripciones"
• "mercado 90 mil con nequi"

Se entienden montos como "15 mil", "15k", "$15.000" o "quince lucas", fechas como "ayer", "el lunes" o "el 2 de marzo", y la categoría se deduce por las palabras. Con # la fijas tú. Si nombras una cuenta ("con nequi", "tarjeta") el gasto queda en ella; si no, va a la predeterminada. Escribe solo "ayer" o solo "nequi" para dejar fija la fecha o la cuenta de lo que sigas escribiendo.

También puedes preguntar:
• "cuánto llevo hoy"
• "cuánto gasté en comida este mes"
• "cuánto llevo con nequi"
• "resumen de la semana"

"deshacer" borra el último gasto. Toca cualquier tarjeta para editarla.`;

export function undoNote(removed: Expense | null, currency: string): string {
  if (!removed) return "No hay ningún gasto para deshacer.";
  const cat = categoryOf(removed.category);
  return `Eliminado: ${formatMoney(removed.amount, currency)} · ${cat.emoji} ${removed.description}`;
}

export function queryReply(
  parsed: Extract<ParsedMessage, { intent: "query" }>,
  expenses: Expense[],
  currency: string,
  now: Date,
  settings?: Settings,
): string {
  const money = (n: number) => formatMoney(n, currency);
  const catName = parsed.category ? `${categoryOf(parsed.category).emoji} ${categoryOf(parsed.category).name}` : null;
  const acctName = parsed.account && settings ? accountLabel(settings, parsed.account) : null;
  const catLabel = catName && acctName ? `${catName} con ${acctName}` : catName ?? (acctName ? `pagos con ${acctName}` : null);

  if (parsed.period === null) {
    const lines: string[] = [];
    const periods: Period[] = ["today", "week", "month"];
    for (const p of periods) {
      const s = summarize(filterExpenses(expenses, rangeForPeriod(p, now), parsed.category, parsed.account));
      lines.push(`${labelTitle(p, now)}: ${money(s.total)}${s.count ? ` · ${s.count} ${plural(s.count)}` : ""}`);
    }
    const intro = catLabel ? `Lo que llevas en ${catLabel}:` : "Así vas:";
    return `${intro}\n${lines.join("\n")}`;
  }

  const range = rangeForPeriod(parsed.period, now);
  const s = summarize(filterExpenses(expenses, range, parsed.category, parsed.account));
  const when = periodLabel(parsed.period, now);
  if (s.count === 0) {
    return catLabel ? `No tienes gastos en ${catLabel} ${when}.` : `No tienes gastos ${when}.`;
  }
  const head = catLabel
    ? `En ${catLabel} ${when} llevas ${money(s.total)} en ${s.count} ${plural(s.count)}.`
    : `${capitalizeFirst(when)} llevas ${money(s.total)} en ${s.count} ${plural(s.count)}.`;
  if (catLabel || s.byCategory.length < 2) return head;
  const top = s.byCategory.slice(0, 3).map((c) => {
    const cat = categoryOf(c.category);
    return `${cat.emoji} ${cat.name}: ${money(c.total)} (${Math.round(c.share * 100)}%)`;
  });
  return `${head}\n${top.join("\n")}`;
}

function labelTitle(p: Period, now: Date): string {
  const l = periodLabel(p, now);
  return capitalizeFirst(l.replace(/^en /, ""));
}

function plural(n: number): string {
  return n === 1 ? "gasto" : "gastos";
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function categoryLabel(id: CategoryId): string {
  const c = categoryOf(id);
  return `${c.emoji} ${c.name}`;
}
