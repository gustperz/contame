import { useMemo, useState } from "react";
import type { Expense, Payment, Period, Settings } from "../domain/types";
import { isCredit, type SpendItem } from "../domain/credit";
import { PaymentCard } from "./PaymentCard";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import { filterExpenses, summarize } from "../domain/summary";
import { formatMoney } from "../utils/money";
import { dayMonth, humanDate, toISODate, type DateRange } from "../utils/dates";
import { closingAround, monthName, periodLabelFor, periodRange, type Closing } from "../utils/months";
import { expensesToCsv, downloadFile } from "../storage/export";
import { Sheet } from "./Sheet";
import { ExpenseCard } from "./ExpenseCard";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Everything that counts as spending: purchases plus card payments. */
  items: SpendItem[];
  currency: string;
  settings: Settings;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onOpenPayment: (p: Payment) => void;
  onCloseMonth: (closing: Closing) => void;
  onReopenMonth: (opens: string) => void;
}

const TABS: Array<{ id: Period; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
];

const WHEN: Partial<Record<Period, string>> = { today: "hoy", week: "esta semana", all: "en total" };

/** "all" | "nocredit" (everything but credit cards) | an account id. */
type AccountFilter = "all" | "nocredit" | string;

export function SummarySheet({ open, onClose, items, currency, settings, onEdit, onDelete, onOpenPayment, onCloseMonth, onReopenMonth }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [filter, setFilter] = useState<AccountFilter>("all");
  const now = new Date();
  const starts = settings.monthStarts;
  const range = periodRange(period, now, starts);
  const isMonth = period === "month" || period === "lastMonth";
  const when = isMonth ? periodLabelFor(period, now, starts) : WHEN[period];
  const span = spanOf(period, range);
  const closing = period === "month" ? closingAround(now, starts) : null;
  const creditAcct = (id: string | undefined) => isCredit(settings, id);
  const hasCredit = settings.accounts.some((a) => a.credit);
  // A filter pointing at a removed account falls back to everything.
  const acct: AccountFilter = filter === "all" || filter === "nocredit" ? filter : settings.accounts.some((a) => a.id === filter) ? filter : "all";
  const filterIsCard = acct !== "all" && acct !== "nocredit" && creditAcct(acct);
  const summary = useMemo(() => {
    const inFilter = (i: SpendItem) => (acct === "all" ? true : acct === "nocredit" ? !creditAcct(i.account) : i.account === acct);
    return summarize(filterExpenses(items, range).filter(inFilter), creditAcct);
  }, [items, period, acct, settings, open]);
  const money = (n: number) => formatMoney(n, currency);

  const credit = summary.credit;
  const direct = summary.total - credit;
  const daysWithSpending = summary.byDay.length || 1;
  const perDay = summary.total / daysWithSpending;
  const periodPayments = summary.expenses.filter((e) => e.payment).map((e) => e.payment!);
  const purchases = summary.expenses.filter((e) => !e.payment);
  let lastDay = "";

  return (
    <Sheet title="Resumen" open={open} onClose={onClose} fill>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={period === t.id}
            className={`tab ${period === t.id ? "tab--active" : ""}`}
            onClick={() => setPeriod(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settings.accounts.length > 0 && (
        <div className="chips" role="group" aria-label="Filtrar por cuenta">
          <button className={`chip ${acct === "all" ? "chip--active" : ""}`} onClick={() => setFilter("all")}>
            Todas
          </button>
          {hasCredit && (
            <button className={`chip ${acct === "nocredit" ? "chip--active" : ""}`} onClick={() => setFilter("nocredit")}>
              Sin tarjetas
            </button>
          )}
          {settings.accounts.map((a) => (
            <button key={a.id} className={`chip ${acct === a.id ? "chip--active" : ""}`} onClick={() => setFilter(a.id)}>
              {a.emoji} {a.name}
            </button>
          ))}
        </div>
      )}

      <div className="total">
        <span className="stat__label">Gastaste {when}</span>
        <span className="total__value">{money(summary.total)}</span>
        {span && <span className="total__range">{span}</span>}
        {credit > 0 && direct > 0 && (
          <div className="split">
            <div className="bar__track bar__track--split">
              <div className="bar__fill" style={{ width: `${(direct / summary.total) * 100}%` }} />
              <div className="bar__fill bar__fill--credit" style={{ width: `${(credit / summary.total) * 100}%` }} />
            </div>
            <div className="legend">
              <span className="legend__item">
                <i className="legend__dot" /> Débito <strong>{money(direct)}</strong>
              </span>
              <span className="legend__item">
                <i className="legend__dot legend__dot--credit" /> Crédito <strong className="text-credit">{money(credit)}</strong>
              </span>
            </div>
          </div>
        )}
        {credit > 0 && direct <= 0 && !filterIsCard && <span className="total__note">Todo a crédito</span>}
        <span className="total__stats">
          {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
          {period !== "today" && summary.count > 0 ? ` · ${money(Math.round(perDay))} por día` : ""}
        </span>
      </div>

      {closing &&
        (closing.start ? (
          <div className="month-card month-card--closed">
            <div className="month-card__text">
              <strong>{cap(monthName(closing.closes))} cerrado</strong>
              <span>
                {cap(monthName(closing.opens))} empezó el {dayMonth(closing.start)}
              </span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (confirm(`¿Reabrir ${monthName(closing.closes)}? Los meses vuelven a ir del 1 al último día.`)) onReopenMonth(closing.opens);
              }}
            >
              Reabrir
            </button>
          </div>
        ) : (
          <div className="month-card">
            <div className="month-card__text">
              <strong>¿Ya te pagaron?</strong>
              <span>
                Cierra {monthName(closing.closes)} y lo que gastes desde ese día cuenta para {monthName(closing.opens)}. Cada gasto guarda su fecha real.
              </span>
            </div>
            <button type="button" className="btn btn--primary btn--block" onClick={() => onCloseMonth(closing)}>
              Cerrar {monthName(closing.closes)}
            </button>
          </div>
        ))}

      {summary.byCategory.length > 0 && (
        <section className="section">
          <h3>Por categoría</h3>
          <ul className="bars">
            {summary.byCategory.map((c) => {
              const cat = categoryOf(c.category);
              const cDirect = c.total - c.credit;
              return (
                <li key={c.category} className="bar">
                  <div className="bar__head">
                    <span>
                      {cat.emoji} {cat.name}
                    </span>
                    <span className="bar__amount">
                      {money(c.total)} <small>{Math.round(c.share * 100)}%</small>
                    </span>
                  </div>
                  <div className="bar__track bar__track--split">
                    {cDirect > 0 && <div className="bar__fill" style={{ width: `${Math.max(2, (cDirect / summary.total) * 100)}%` }} />}
                    {c.credit > 0 && <div className="bar__fill bar__fill--credit" style={{ width: `${Math.max(2, (c.credit / summary.total) * 100)}%` }} />}
                  </div>
                  {c.credit > 0 && !filterIsCard && <span className="bar__note">{cDirect > 0 ? `${money(c.credit)} a crédito` : "todo a crédito"}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(acct === "all" || acct === "nocredit") && summary.byAccount.some((a) => a.account) && (
        <section className="section">
          <h3>Por cuenta</h3>
          <ul className="bars">
            {summary.byAccount.map((a) => {
              const account = accountOf(settings, a.account);
              return (
                <li key={a.account || "none"} className="bar">
                  <div className="bar__head">
                    <span>{account ? `${account.emoji} ${account.name}` : "Sin cuenta"}</span>
                    <span className="bar__amount">
                      {money(a.total)} <small>{Math.round(a.share * 100)}%</small>
                    </span>
                  </div>
                  <div className="bar__track">
                    <div className={`bar__fill ${creditAcct(a.account) ? "bar__fill--credit" : "bar__fill--account"}`} style={{ width: `${Math.max(2, a.share * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h3>Movimientos</h3>
          {summary.count > 0 && (
            <button
              className="chip-btn"
              onClick={() => downloadFile(`contame-${period}-${new Date().toISOString().slice(0, 10)}.csv`, expensesToCsv(purchases, settings, periodPayments), "text/csv;charset=utf-8")}
            >
              Exportar CSV
            </button>
          )}
        </div>
        {summary.count === 0 ? (
          <p className="empty">Sin gastos en este periodo.</p>
        ) : (
          <ul className="list">
            {summary.expenses.map((e) => {
              const divider = e.date !== lastDay ? <li className="list__day">{humanDate(e.date, now)}</li> : null;
              lastDay = e.date;
              return (
                <li key={e.id} className="list__item-wrap">
                  {divider}
                  {e.payment ? (
                    <PaymentCard payment={e.payment} currency={currency} settings={settings} onOpen={onOpenPayment} compact />
                  ) : (
                    <ExpenseCard expense={e} currency={currency} settings={settings} onEdit={onEdit} onDelete={onDelete} showDate={false} compact />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Sheet>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The days a month covers, said only when a closing moved it away from the calendar. */
function spanOf(period: Period, range: DateRange | null): string | null {
  if (!range || (period !== "month" && period !== "lastMonth")) return null;
  const starts1st = range.from.endsWith("-01");
  if (period === "month") return starts1st ? null : `Desde el ${dayMonth(range.from)}`;
  const sameMonth = range.to.slice(0, 7) === range.from.slice(0, 7);
  if (starts1st && sameMonth && range.to === lastDayOf(range.from)) return null;
  // "Del 1 al 28 sep", or "Del 29 ago al 28 sep".
  return `Del ${sameMonth ? Number(range.from.slice(8)) : dayMonth(range.from)} al ${dayMonth(range.to)}`;
}

function lastDayOf(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return toISODate(new Date(y, m, 0));
}
