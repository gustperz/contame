import type { Payment, Settings } from "../domain/types";
import { accountOf } from "../domain/accounts";
import { formatMoney } from "../utils/money";
import { ArrowRightIcon } from "./icons";

interface Props {
  payment: Payment;
  currency: string;
  settings: Settings;
  onOpen: (p: Payment) => void;
  compact?: boolean;
}

/** A payment to a credit card as it appears in the log: just what, from where and how much. */
export function PaymentCard({ payment, currency, settings, onOpen, compact = false }: Props) {
  const to = accountOf(settings, payment.toAccount);
  const from = accountOf(settings, payment.fromAccount);
  return (
    <div className={`expense payment${compact ? " expense--compact" : ""}`}>
      <button className="expense__main" onClick={() => onOpen(payment)} aria-label={`Ver pago a ${to?.name ?? "tarjeta"}`}>
        <span className="expense__emoji payment__icon" aria-hidden>
          <ArrowRightIcon />
        </span>
        <span className="expense__text">
          <span className="expense__desc payment__title">Pagaste la tarjeta</span>
          <span className="expense__meta">
            {to ? `${to.emoji} ${to.name}` : "Tarjeta"}
            {from ? ` · desde ${from.emoji} ${from.name}` : ""}
          </span>
        </span>
        <span className="expense__amount payment__amount">{formatMoney(payment.amount, currency)}</span>
      </button>
    </div>
  );
}
