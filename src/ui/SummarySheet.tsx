import { useMemo, useState } from "react";
import type { Expense, Payment, Period, Settings } from "../domain/types";
import type { Allocation, SpendItem } from "../domain/credit";
import { PaymentCard } from "./PaymentCard";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import { filterExpenses, summarize } from "../domain/summary";
import { formatMoney } from "../utils/money";
import { humanDate, rangeForPeriod } from "../utils/dates";
import { expensesToCsv, downloadFile } from "../storage/export";
import { Sheet } from "./Sheet";
import { ExpenseCard } from "./ExpenseCard";

interface Props {
  open: boolean;
  onClose: () => void;
  /** What counts as spending: direct expenses plus the paid slices of credit purchases. */
  items: SpendItem[];
  expensesById: Map<string, Expense>;
  payments: Payment[];
  allocation: Allocation;
  currency: string;
  settings: Settings;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onOpenPayment: (p: Payment) => void;
}

const TABS: Array<{ id: Period; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
];

export function SummarySheet({ open, onClose, items, expensesById, payments, allocation, currency, settings, onEdit, onDelete, onOpenPayment }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const now = new Date();
  const range = rangeForPeriod(period, now);
  const summary = useMemo(() => summarize(filterExpenses(items, range, null, null)), [items, period, open]);
  const periodPayments = useMemo(() => payments.filter((p) => !range || (p.date >= range.from && p.date <= range.to)), [payments, period, open]);
  const viaCard = summary.expenses.filter((e) => e.via).reduce((s, e) => s + e.amount, 0);
  const direct = summary.total - viaCard;
  const owed = allocation.status.filter((s) => s.debt > 0 || periodPayments.some((p) => p.toAccount === s.account.id));
  const money = (n: number) => formatMoney(n, currency);

  const daysWithSpending = summary.byDay.length || 1;
  const perDay = summary.total / daysWithSpending;
  /** Tapping a paid slice edits the original purchase. */
  const editItem = (e: SpendItem) => onEdit(e.via ? expensesById.get(e.via.expenseId) ?? e : e);

  let lastDay = "";

  return (
    <Sheet title="Resumen" open={open} onClose={onClose}>
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

      {viaCard > 0 ? (
        <div className="flow">
          <span className="stat__label">Gastaste {period === "today" ? "hoy" : period === "week" ? "esta semana" : period === "month" ? "este mes" : period === "lastMonth" ? "el mes pasado" : "en total"}</span>
          <span className="stat__value stat__value--big">{money(summary.total)}</span>
          <div className="flow__arrow" aria-hidden>
            ↓
          </div>
          <div className="flow__boxes">
            <div className="flow__box">
              <span className="flow__label">De contado</span>
              <span className="flow__value">{money(direct)}</span>
              <span className="flow__sub">lo que pagaste directo</span>
            </div>
            <div className="flow__box flow__box--card">
              <span className="flow__label">Pago de la tarjeta</span>
              <span className="flow__value">{money(viaCard)}</span>
              <span className="flow__sub">compras a crédito que pagaste</span>
            </div>
          </div>
          <span className="hint">Lo pagado con la tarjeta entra en la categoría de cada compra.</span>
        </div>
      ) : null}
      <div className="stats">
        {viaCard <= 0 && (
          <div className="stat stat--big">
            <span className="stat__label">Total</span>
            <span className="stat__value">{formatMoney(summary.total, currency)}</span>
          </div>
        )}
        <div className="stat">
          <span className="stat__label">Gastos</span>
          <span className="stat__value">{summary.count}</span>
        </div>
        {period !== "today" && (
          <div className="stat">
            <span className="stat__label">Por día</span>
            <span className="stat__value">{formatMoney(Math.round(perDay), currency)}</span>
          </div>
        )}
      </div>

      {owed.length > 0 && (
        <section className="section">
          <h3>{owed.length === 1 ? "Tarjeta de crédito" : "Tarjetas de crédito"}</h3>
          <ul className="bars">
            {owed.map((s) => {
              const paidHere = periodPayments.filter((p) => p.toAccount === s.account.id).reduce((t, p) => t + p.amount, 0);
              return (
                <li key={s.account.id} className="credit">
                  <div className="credit__head">
                    <span className="credit__name">
                      {s.account.emoji} {s.account.name}
                    </span>
                    {s.debt > 0 ? (
                      <span className="credit__debt text-danger">debes {money(s.debt)}</span>
                    ) : (
                      <span className="credit__debt text-accent">al día{s.debt < 0 ? ` · ${money(-s.debt)} a tu favor` : ""}</span>
                    )}
                  </div>
                  {paidHere > 0 && <span className="hint">Pagaste {money(paidHere)} en este periodo.</span>}
                  {s.initialPending > 0 && (
                    <div className="credit__row">
                      <span>Deuda anterior a la app</span>
                      <span>{money(s.initialPending)}</span>
                    </div>
                  )}
                  {s.pending.slice(0, 5).map(({ expense, pending }) => {
                    const cat = categoryOf(expense.category);
                    const paidPart = expense.amount - pending;
                    return (
                      <div key={expense.id} className="credit__item">
                        <div className="credit__row">
                          <span>
                            {cat.emoji} {expense.description}
                            {expense.installments ? ` · ${expense.installments} cuotas` : ""}
                          </span>
                          <span>{paidPart > 0 ? `${money(paidPart)} de ${money(expense.amount)}` : money(expense.amount)}</span>
                        </div>
                        {paidPart > 0 && (
                          <div className="bar__track bar__track--thin">
                            <div className="bar__fill bar__fill--account" style={{ width: `${Math.max(2, (paidPart / expense.amount) * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {s.pending.length > 5 && <span className="hint">… y {s.pending.length - 5} compras más pendientes</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {summary.byCategory.length > 0 && (
        <section className="section">
          <h3>Por categoría</h3>
          <ul className="bars">
            {summary.byCategory.map((c) => {
              const cat = categoryOf(c.category);
              return (
                <li key={c.category} className="bar">
                  <div className="bar__head">
                    <span>
                      {cat.emoji} {cat.name}
                    </span>
                    <span className="bar__amount">
                      {formatMoney(c.total, currency)} <small>{Math.round(c.share * 100)}%</small>
                    </span>
                  </div>
                  <div className="bar__track">
                    <div className="bar__fill" style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {summary.byAccount.some((a) => a.account) && (
        <section className="section">
          <h3>Por cuenta</h3>
          <ul className="bars">
            {summary.byAccount.map((a) => {
              const acct = accountOf(settings, a.account);
              return (
                <li key={a.account || "none"} className="bar">
                  <div className="bar__head">
                    <span>{acct ? `${acct.emoji} ${acct.name}` : "Sin cuenta"}</span>
                    <span className="bar__amount">
                      {formatMoney(a.total, currency)} <small>{Math.round(a.share * 100)}%</small>
                    </span>
                  </div>
                  <div className="bar__track">
                    <div className="bar__fill bar__fill--account" style={{ width: `${Math.max(2, a.share * 100)}%` }} />
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
              onClick={() => downloadFile(`contame-${period}-${new Date().toISOString().slice(0, 10)}.csv`, expensesToCsv(summary.expenses, settings, periodPayments), "text/csv;charset=utf-8")}
            >
              Exportar CSV
            </button>
          )}
        </div>
        {summary.count === 0 && periodPayments.length === 0 ? (
          <p className="empty">Sin gastos en este periodo.</p>
        ) : (
          <ul className="list">
            {[
              ...summary.expenses.map((e) => ({ kind: "expense" as const, date: e.date, sort: e.createdAt, e })),
              ...periodPayments.map((p) => ({ kind: "payment" as const, date: p.date, sort: p.createdAt, p })),
            ]
              .sort((a, b) => (a.date === b.date ? b.sort - a.sort : a.date < b.date ? 1 : -1))
              .map((row) => {
                const divider = row.date !== lastDay ? <li className="list__day">{humanDate(row.date, now)}</li> : null;
                lastDay = row.date;
                return (
                  <li key={row.kind === "expense" ? row.e.id : row.p.id} className="list__item-wrap">
                    {divider}
                    {row.kind === "expense" ? (
                      <ExpenseCard expense={row.e} currency={currency} settings={settings} onEdit={() => editItem(row.e)} onDelete={onDelete} showDate={false} compact />
                    ) : (
                      <PaymentCard payment={row.p} currency={currency} settings={settings} onOpen={onOpenPayment} compact />
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
