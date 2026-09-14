import type { Account, Expense, Payment, Settings } from "./types";
import { accountOf } from "./accounts";

/**
 * An expense as it counts toward spending. Purchases count as they are, whatever
 * the account; a payment to a credit card counts too, in the "deuda" category and
 * from the account the money left. `payment` marks those.
 */
export interface SpendItem extends Expense {
  payment?: Payment;
}

export function isCredit(settings: Settings, accountId: string | undefined): boolean {
  return !!accountId && !!settings.accounts.find((a) => a.id === accountId)?.credit;
}

/** A card payment as a spend item: category Deuda, dated on the payment, from the source account. */
export function paymentItem(settings: Settings, p: Payment): SpendItem {
  const to = accountOf(settings, p.toAccount);
  return {
    id: p.id,
    amount: p.amount,
    category: "deuda",
    description: to ? `Pago ${to.emoji} ${to.name}` : "Pago de la tarjeta",
    account: p.fromAccount,
    date: p.date,
    createdAt: p.createdAt,
    ...(p.source ? { source: p.source } : {}),
    payment: p,
  };
}

/** Everything that counts as spending, ready for summaries: purchases plus card payments. */
export function spendItems(settings: Settings, expenses: Expense[], payments: Payment[]): SpendItem[] {
  return [...expenses, ...payments.map((p) => paymentItem(settings, p))];
}

export interface CreditStatus {
  account: Account;
  initialDebt: number;
  purchases: number;
  payments: number;
  /** initialDebt + purchases − payments. Negative means a balance in your favour. */
  debt: number;
}

/** What is owed on each credit card: what was owed before the app, plus purchases, minus payments. */
export function creditStatus(settings: Settings, expenses: Expense[], payments: Payment[]): CreditStatus[] {
  return settings.accounts
    .filter((a) => a.credit)
    .map((account) => {
      const initialDebt = Math.max(0, account.initialDebt ?? 0);
      const purchases = expenses.filter((e) => e.account === account.id).reduce((s, e) => s + e.amount, 0);
      const paid = payments.filter((p) => p.toAccount === account.id).reduce((s, p) => s + p.amount, 0);
      return { account, initialDebt, purchases, payments: paid, debt: initialDebt + purchases - paid };
    });
}
