import { useEffect, useState } from "react";
import type { Expense, Payment, Settings } from "../domain/types";
import type { Allocation } from "../domain/credit";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import { formatMoney } from "../utils/money";
import { humanDate } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  payment: Payment | null;
  allocation: Allocation;
  expensesById: Map<string, Expense>;
  settings: Settings;
  currency: string;
  onSave: (p: Payment) => void;
  onDelete: (p: Payment) => void;
  onClose: () => void;
}

function sheetTitle(day: string): string {
  return day === "Hoy" || day === "Ayer" ? `Pago de ${day.toLowerCase()}` : `Pago del ${day}`;
}

/** Detail of a card payment: amount, origin, debt before/after, edit form and the purchases it covered. */
export function PaymentSheet({ payment, allocation, expensesById, settings, currency, onSave, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!payment) return;
    setEditing(false);
    setAmount(String(payment.amount));
    setToAccount(payment.toAccount);
    setFromAccount(payment.fromAccount ?? "");
    setDate(payment.date);
  }, [payment]);

  if (!payment) return null;
  const money = (n: number) => formatMoney(n, currency);
  const alloc = allocation.byPayment.get(payment.id);
  const to = accountOf(settings, payment.toAccount);
  const from = accountOf(settings, payment.fromAccount);
  const creditAccounts = settings.accounts.filter((a) => a.credit);
  const parsedAmount = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !!toAccount;

  const covered = (alloc?.covers ?? []).map((c) => ({ ...c, expense: c.expenseId ? expensesById.get(c.expenseId) : undefined }));
  let lastDay = "";

  return (
    <Sheet title={sheetTitle(humanDate(payment.date))} open onClose={onClose}>
      {editing ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave({ ...payment, amount: parsedAmount, toAccount, date, fromAccount: fromAccount || undefined });
            setEditing(false);
          }}
        >
          <label className="field">
            <span>Monto</span>
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Tarjeta que pagaste</span>
            <select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Desde qué cuenta</span>
            <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
              <option value="">Sin indicar</option>
              {settings.accounts
                .filter((a) => !a.credit)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {payment.source && <p className="hint">Mensaje original: “{payment.source}”</p>}
          <p className="hint">Un pago no tiene categoría: lo que cubre entra como gasto en la categoría de cada compra.</p>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (confirm("¿Eliminar este pago? Las compras que cubría volverán a quedar pendientes.")) {
                  onDelete(payment);
                  onClose();
                }
              }}
            >
              Eliminar
            </button>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={!valid}>
              Guardar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="payment-head">
            <div className="payment-head__row">
              <div className="payment-head__main">
                <span className="payment-head__amount">{money(payment.amount)}</span>
                <span className="payment-head__meta">
                  {to ? `a ${to.emoji} ${to.name}` : "a la tarjeta"}
                  {from ? ` · desde ${from.emoji} ${from.name}` : " · origen sin indicar"}
                </span>
              </div>
              <button className="btn btn--small" onClick={() => setEditing(true)}>
                Editar
              </button>
            </div>
            {alloc && (
              <div className="payment-head__debt">
                <span>Deuda de la tarjeta</span>
                <span>
                  <s>{money(Math.max(0, alloc.debtBefore))}</s> <strong className={alloc.debtAfter > 0 ? "text-danger" : "text-accent"}>{money(Math.max(0, alloc.debtAfter))}</strong>
                  {alloc.debtAfter < 0 ? <small> · {money(-alloc.debtAfter)} a tu favor</small> : null}
                </span>
              </div>
            )}
            <p className="hint">
              {covered.length === 0
                ? "No cubre ninguna compra registrada."
                : `Cubre ${covered.filter((c) => c.expense).length} ${covered.filter((c) => c.expense).length === 1 ? "compra" : "compras"}, de la más antigua a la más nueva.${covered.some((c) => c.expense && c.amount < c.expense.amount) ? " La última queda parcial." : ""}`}
              {alloc && alloc.surplus > 0 ? ` Sobraron ${money(alloc.surplus)} que cubrirán compras futuras.` : ""}
            </p>
          </div>

          {covered.length > 0 && (
            <section className="section">
              <h3>Compras cubiertas</h3>
              <ul className="list">
                {covered.map((c, i) => {
                  if (!c.expense) {
                    return (
                      <li key={`initial-${i}`} className="list__item-wrap">
                        <div className="covered">
                          <span className="expense__emoji" aria-hidden>
                            💳
                          </span>
                          <span className="expense__text">
                            <span className="expense__desc">Deuda anterior a la app</span>
                            <span className="expense__meta">No cuenta como gasto</span>
                          </span>
                          <span className="expense__amount">{money(c.amount)}</span>
                        </div>
                      </li>
                    );
                  }
                  const e = c.expense;
                  const cat = categoryOf(e.category);
                  const partial = c.amount < e.amount;
                  const divider = e.date !== lastDay ? <li className="list__day">{humanDate(e.date)}</li> : null;
                  lastDay = e.date;
                  const paid = allocation.byExpense.get(e.id);
                  return (
                    <li key={`${e.id}-${i}`} className="list__item-wrap">
                      {divider}
                      <div className="covered">
                        <span className="expense__emoji" aria-hidden>
                          {cat.emoji}
                        </span>
                        <span className="expense__text">
                          <span className="expense__desc">
                            {e.description}
                            {partial && <span className="tag tag--pending">parcial</span>}
                          </span>
                          <span className="expense__meta">
                            {cat.name}
                            {e.installments ? ` · ${e.installments} cuotas` : ""}
                            {partial && paid ? ` · quedan ${money(paid.pending)}` : ""}
                          </span>
                        </span>
                        <span className="expense__amount">{money(c.amount)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}
