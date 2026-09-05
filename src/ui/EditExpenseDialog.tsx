import { useEffect, useState } from "react";
import type { CategoryId, Expense } from "../domain/types";
import { CATEGORIES } from "../domain/categories";
import { Sheet } from "./Sheet";
import { currencyInfo } from "../utils/money";

interface Props {
  expense: Expense | null;
  currency: string;
  onSave: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onClose: () => void;
}

export function EditExpenseDialog({ expense, currency, onSave, onDelete, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!expense) return;
    setAmount(String(expense.amount));
    setDescription(expense.description);
    setCategory(expense.category);
    setDate(expense.date);
  }, [expense]);

  if (!expense) return null;
  const decimals = currencyInfo(currency).decimals;
  const parsedAmount = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <Sheet title="Editar gasto" open onClose={onClose} size="dialog">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ ...expense, amount: parsedAmount, description: description.trim() || expense.description, category, date });
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
          <span>Fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {expense.source && <p className="hint">Mensaje original: “{expense.source}”</p>}
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm("¿Eliminar este gasto?")) {
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
