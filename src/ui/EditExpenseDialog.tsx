import { useEffect, useState } from "react";
import type { CategoryId, Expense, Settings } from "../domain/types";
import { CATEGORIES } from "../domain/categories";
import { Sheet } from "./Sheet";
import { MergeIcon } from "./icons";
import { currencyInfo } from "../utils/money";

interface Props {
  expense: Expense | null;
  currency: string;
  settings: Settings;
  /** When true the expense does not exist yet (completing an unparsed message). */
  isNew?: boolean;
  onSave: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onClose: () => void;
  /** Saves the expense as a payment to a credit card instead; left out where that is not possible. */
  onPayCard?: (e: Expense, card: string) => void;
  /** Offers joining this expense with another saved one; left out where that is not possible. */
  onJoin?: (e: Expense) => void;
}

export function EditExpenseDialog({ expense, currency, settings, isNew = false, onSave, onDelete, onClose, onJoin, onPayCard }: Props) {
  const [payCard, setPayCard] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [date, setDate] = useState("");
  const [account, setAccount] = useState("");
  const [installments, setInstallments] = useState("");

  useEffect(() => {
    if (!expense) return;
    setAmount(expense.amount > 0 ? String(expense.amount) : "");
    setDescription(expense.description);
    setCategory(expense.category);
    setDate(expense.date);
    setAccount(expense.account ?? "");
    setInstallments(expense.installments ? String(expense.installments) : "");
    setPayCard("");
  }, [expense]);

  if (!expense) return null;
  const decimals = currencyInfo(currency).decimals;
  const parsedAmount = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isCreditAccount = !!settings.accounts.find((a) => a.id === account)?.credit;
  const parsedInstallments = Number(installments);
  // A debt payment can be tied to the card it paid, so it lowers what is owed on it.
  const cards = onPayCard && !isNew && category === "deuda" ? settings.accounts.filter((a) => a.credit && a.id !== account) : [];
  const paying = cards.find((a) => a.id === payCard);

  return (
    <Sheet title={isNew ? "Completar gasto" : "Editar gasto"} open onClose={onClose} size="dialog">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const inst = isCreditAccount && Number.isInteger(parsedInstallments) && parsedInstallments > 1 ? parsedInstallments : undefined;
          const { installments: _drop, ...rest } = expense;
          void _drop;
          const edited = { ...rest, amount: parsedAmount, description: description.trim() || expense.description, category, date, account: account || undefined, ...(inst ? { installments: inst } : {}) };
          if (paying && onPayCard) onPayCard(edited, paying.id);
          else onSave(edited);
          onClose();
        }}
      >
        <label className="field">
          <span>Monto</span>
          <input
            type="number"
            inputMode="decimal"
            step={decimals ? "0.01" : "1"}
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={isNew ? "¿Cuánto fue?" : undefined}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Descripción</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cuenta</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {/* Shown only as the current state of an expense without account; not an option to pick. */}
            {!expense.account && (
              <option value="" disabled hidden>
                Sin cuenta
              </option>
            )}
            {settings.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </label>
        {cards.length > 0 && (
          <label className="field">
            <span>¿Es un pago a una tarjeta?</span>
            <select value={paying ? payCard : ""} onChange={(e) => setPayCard(e.target.value)}>
              <option value="">No, es otra deuda</option>
              {cards.map((a) => (
                <option key={a.id} value={a.id}>
                  Sí, a {a.emoji} {a.name}
                </option>
              ))}
            </select>
            {paying && <small className="field__hint">Queda como pago a {paying.name} y baja lo que debes de esa tarjeta.</small>}
          </label>
        )}
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {isCreditAccount && (
          <label className="field">
            <span>Cuotas</span>
            <input type="number" inputMode="numeric" min="1" max="60" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} placeholder="1" />
          </label>
        )}
        {expense.source &&
          (expense.parts && expense.parts > 1 ? (
            <div className="hint">
              Unido de {expense.parts} movimientos:
              <ul className="source-list">
                {expense.source.split("\n").map((line, i) => (
                  <li key={i}>“{line}”</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">Mensaje original: “{expense.source}”</p>
          ))}
        {onJoin && !isNew && (
          <button type="button" className="btn btn--outline btn--block" onClick={() => onJoin(expense)}>
            <MergeIcon width={18} height={18} /> Unir con otro gasto
          </button>
        )}
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm(isNew ? "¿Eliminar este mensaje?" : "¿Eliminar este gasto?")) {
                onDelete(expense);
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
