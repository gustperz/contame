import { useEffect, useState } from "react";
import type { Payment, Settings } from "../domain/types";
import { humanDate } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  payment: Payment | null;
  settings: Settings;
  currency: string;
  onSave: (p: Payment) => void;
  onDelete: (p: Payment) => void;
  onClose: () => void;
}

function sheetTitle(day: string): string {
  return day === "Hoy" || day === "Ayer" ? `Pago de ${day.toLowerCase()}` : `Pago del ${day}`;
}

/** A card payment: amount, which card, from which account and when. */
export function PaymentSheet({ payment, settings, onSave, onDelete, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!payment) return;
    setAmount(String(payment.amount));
    setToAccount(payment.toAccount);
    setFromAccount(payment.fromAccount ?? "");
    setDate(payment.date);
  }, [payment]);

  if (!payment) return null;
  const creditAccounts = settings.accounts.filter((a) => a.credit);
  const parsedAmount = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !!toAccount;

  return (
    <Sheet title={sheetTitle(humanDate(payment.date))} open onClose={onClose} size="dialog">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ ...payment, amount: parsedAmount, toAccount, date, fromAccount: fromAccount || undefined });
          onClose();
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
        <p className="hint">El pago cuenta como gasto en la categoría 💳 Deuda, en la cuenta de donde salió.</p>
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm("¿Eliminar este pago?")) {
                onDelete(payment);
                onClose();
              }
            }}
          >
            Eliminar
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
