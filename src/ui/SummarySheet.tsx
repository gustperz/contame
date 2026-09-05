import { useMemo, useState } from "react";
import type { Expense, Period } from "../domain/types";
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
  expenses: Expense[];
  currency: string;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

const TABS: Array<{ id: Period; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
];

export function SummarySheet({ open, onClose, expenses, currency, onEdit, onDelete }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const now = new Date();
  const summary = useMemo(() => summarize(filterExpenses(expenses, rangeForPeriod(period, now))), [expenses, period, open]);

  const daysWithSpending = summary.byDay.length || 1;
  const perDay = summary.total / daysWithSpending;

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

      <div className="stats">
        <div className="stat stat--big">
          <span className="stat__label">Total</span>
          <span className="stat__value">{formatMoney(summary.total, currency)}</span>
        </div>
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

      <section className="section">
        <div className="section__head">
          <h3>Movimientos</h3>
          {summary.count > 0 && (
            <button
              className="chip-btn"
              onClick={() => downloadFile(`contame-${period}-${new Date().toISOString().slice(0, 10)}.csv`, expensesToCsv(summary.expenses), "text/csv;charset=utf-8")}
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
                  <ExpenseCard expense={e} currency={currency} onEdit={onEdit} onDelete={onDelete} showDate={false} compact />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Sheet>
  );
}
