import type { Expense } from "../domain/types";
import { categoryOf } from "../domain/categories";
import { formatMoney } from "../utils/money";
import { humanDate } from "../utils/dates";
import { PencilIcon, TrashIcon } from "./icons";

interface Props {
  expense: Expense;
  currency: string;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  showDate?: boolean;
  compact?: boolean;
  /** Show the Editar/Eliminar row. Tapping the card always opens the editor. */
  actions?: boolean;
}

export function ExpenseCard({ expense, currency, onEdit, onDelete, showDate = true, compact = false, actions = true }: Props) {
  const cat = categoryOf(expense.category);
  const date = humanDate(expense.date);
  return (
    <div className={`expense${compact ? " expense--compact" : ""}`}>
      <button className="expense__main" onClick={() => onEdit(expense)} aria-label={`Editar ${expense.description}`}>
        <span className="expense__emoji" aria-hidden>
          {cat.emoji}
        </span>
        <span className="expense__text">
          <span className="expense__desc">{expense.description}</span>
          <span className="expense__meta">
            {cat.name}
            {showDate && date !== "Hoy" ? ` · ${date}` : ""}
          </span>
        </span>
        <span className="expense__amount">{formatMoney(expense.amount, currency)}</span>
      </button>
      {!compact && actions && (
        <div className="expense__actions">
          <button className="chip-btn" onClick={() => onEdit(expense)}>
            <PencilIcon /> Editar
          </button>
          <button className="chip-btn chip-btn--danger" onClick={() => onDelete(expense)}>
            <TrashIcon /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
