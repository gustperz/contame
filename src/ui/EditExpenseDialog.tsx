import { useEffect, useState } from "react";
import type { CategoryId, Expense, Settings } from "../domain/types";
import { CATEGORIES } from "../domain/categories";
import { Sheet } from "./Sheet";
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
}

export function EditExpenseDialog({ expense, currency, settings, isNew = false, onSave, onDelete, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [date, setDate] = useState("");
  const [account, setAccount] = useState("");

  useEffect(() => {
    if (!expense) return;
    setAmount(expense.amount > 0 ? String(expense.amount) : "");
    setDescription(expense.description);
    setCategory(expense.category);
    setDate(expense.date);
    setAccount(expense.account ?? "");
  }, [expense]);

  if (!expense) return null;
  const decimals = currencyInfo(currency).decimals;
  const parsedAmount = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <Sheet title={isNew ? "Completar gasto" : "Editar gasto"} open onClose={onClose} size="dialog">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ ...expense, amount: parsedAmount, description: description.trim() || expense.description, category, date, account: account || undefined });
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
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {expense.source && <p className="hint">Mensaje original: “{expense.source}”</p>}
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
