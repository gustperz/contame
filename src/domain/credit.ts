import type { Account, Expense, Payment, Settings } from "./types";
import { accountOf } from "./accounts";
import { normalize } from "../utils/text";

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
    ...(p.by ? { by: p.by } : {}),
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

const GENERIC = new Set(["tarjeta", "tarjetas", "de", "del", "la", "el", "credito", "tc", "banco", "cuenta", "visa", "mastercard"]);

/**
 * The credit card a text says was paid ("Pago tarjeta Nu", "pago tc lulo"),
 * when it names exactly one of the person's cards. A payment that names no
 * known card is left alone rather than guessed.
 */
export function cardPaidIn(text: string, settings: Settings): string | undefined {
  const words = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.some((w) => w === "pago" || w === "pague" || w === "abono" || w === "abone")) return undefined;
  if (!words.some((w) => w === "tarjeta" || w === "tc" || w === "credito")) return undefined;
  const matches = settings.accounts.filter((a) => {
    if (!a.credit) return false;
    const names = [a.name, ...a.aliases].flatMap((n) => normalize(n).split(/[^a-z0-9]+/)).filter((w) => w && !GENERIC.has(w));
    return names.some((n) => words.includes(n));
  });
  return matches.length === 1 ? matches[0].id : undefined;
}

/**
 * An expense that was really a payment to a credit card, as that payment:
 * same id, amount, day and author, leaving from the account the expense had.
 * As a payment it lowers what is owed on the card.
 */
export function paymentFromExpense(e: Expense, toAccount: string): Payment {
  return {
    id: e.id,
    amount: e.amount,
    toAccount,
    date: e.date,
    createdAt: e.createdAt,
    ...(e.account && e.account !== toAccount ? { fromAccount: e.account } : {}),
    ...(e.source ? { source: e.source } : {}),
    ...(e.by ? { by: e.by } : {}),
  };
}
