import type { Expense, Settings } from "../domain/types";
import type { ExpensePaid, SpendItem } from "../domain/credit";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import { formatMoney } from "../utils/money";
import { humanDate } from "../utils/dates";
import { ClockIcon, PencilIcon, TrashIcon } from "./icons";

interface Props {
  expense: SpendItem;
  /** Credit allocation for this purchase, when it was made with a credit card. */
  paid?: ExpensePaid;
  currency: string;
  settings: Settings;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  showDate?: boolean;
  compact?: boolean;
  /** Show the Editar/Eliminar row. Tapping the card always opens the editor. */
  actions?: boolean;
}

export function ExpenseCard({ expense, paid, currency, settings, onEdit, onDelete, showDate = true, compact = false, actions = true }: Props) {
  const cat = categoryOf(expense.category);
  const account = accountOf(settings, expense.account);
  const date = humanDate(expense.date);
  const pending = paid && paid.pending > 0 ? paid.pending : 0;
  const partial = pending > 0 && paid!.paid > 0;
  return (
    <div className={`expense${compact ? " expense--compact" : ""}${pending > 0 ? " expense--pending" : ""}`}>
      <button className="expense__main" onClick={() => onEdit(expense)} aria-label={`Editar ${expense.description}`}>
        <span className="expense__emoji" aria-hidden>
          {cat.emoji}
        </span>
        <span className="expense__text">
          <span className="expense__desc">{expense.description}</span>
          <span className="expense__meta">
            {cat.name}
            {account ? ` · ${account.emoji} ${account.name}` : ""}
            {expense.installments ? ` · ${expense.installments} cuotas` : ""}
            {expense.via ? ` · parte de ${formatMoney(expense.via.original, currency)}` : ""}
            {showDate && date !== "Hoy" ? ` · ${date}` : ""}
            {partial ? ` · quedan ${formatMoney(pending, currency)}` : ""}
          </span>
        </span>
        <span className="expense__right">
          {pending > 0 && (
            <span className="tag tag--credit">
              <ClockIcon />
              crédito
            </span>
          )}
          <span className="expense__amount">{formatMoney(expense.amount, currency)}</span>
        </span>
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
