import type { Account, Expense, ISODate, Payment, Settings } from "./types";

/** How much of a credit purchase each payment covered. */
export interface PaidPart {
  paymentId: string;
  amount: number;
  date: ISODate;
}

export interface ExpensePaid {
  expenseId: string;
  paid: number;
  pending: number;
  parts: PaidPart[];
}

/** One slice of a payment: an expense (or the debt that predates the app when expenseId is null). */
export interface Coverage {
  expenseId: string | null;
  amount: number;
}

export interface PaymentAllocation {
  payment: Payment;
  covers: Coverage[];
  /** Paid beyond everything pending at that point (a prepayment). */
  surplus: number;
  debtBefore: number;
  debtAfter: number;
}

export interface CreditStatus {
  account: Account;
  initialDebt: number;
  initialPending: number;
  purchases: number;
  payments: number;
  /** initialDebt + purchases − payments. Negative means a balance in your favour. */
  debt: number;
  /** Purchases with something still unpaid, oldest first. */
  pending: Array<{ expense: Expense; pending: number }>;
}

export interface Allocation {
  byExpense: Map<string, ExpensePaid>;
  byPayment: Map<string, PaymentAllocation>;
  status: CreditStatus[];
  /** Sum of every credit account's debt (only positive balances). */
  totalDebt: number;
}

const byDate = <T extends { date: ISODate; createdAt: number }>(a: T, b: T) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1);

export function isCredit(settings: Settings, accountId: string | undefined): boolean {
  return !!accountId && !!settings.accounts.find((a) => a.id === accountId)?.credit;
}

/**
 * Distributes every payment over the purchases of its credit account, oldest first
 * (the debt that predates the app goes first of all). Pure: derived from the data,
 * so editing a purchase or a payment simply re-derives everything.
 */
export function allocate(settings: Settings, expenses: Expense[], payments: Payment[]): Allocation {
  const byExpense = new Map<string, ExpensePaid>();
  const byPayment = new Map<string, PaymentAllocation>();
  const status: CreditStatus[] = [];

  for (const account of settings.accounts.filter((a) => a.credit)) {
    const purchases = expenses.filter((e) => e.account === account.id).sort(byDate);
    const pays = payments.filter((p) => p.toAccount === account.id).sort(byDate);
    const initialDebt = Math.max(0, account.initialDebt ?? 0);

    // Items to cover, in order: initial debt, then purchases.
    const items: Array<{ expenseId: string | null; remaining: number }> = [];
    if (initialDebt > 0) items.push({ expenseId: null, remaining: initialDebt });
    for (const e of purchases) {
      items.push({ expenseId: e.id, remaining: e.amount });
      byExpense.set(e.id, { expenseId: e.id, paid: 0, pending: e.amount, parts: [] });
    }

    let cursor = 0;
    let paidSoFar = 0;
    for (const p of pays) {
      // Debt as it stood on the payment date: what was bought up to then, minus earlier payments.
      const boughtUntil = initialDebt + purchases.filter((e) => e.date <= p.date).reduce((s, e) => s + e.amount, 0);
      const debtBefore = boughtUntil - paidSoFar;
      let remaining = p.amount;
      const covers: Coverage[] = [];
      while (remaining > 0 && cursor < items.length) {
        const item = items[cursor];
        const take = Math.min(remaining, item.remaining);
        if (take > 0) {
          covers.push({ expenseId: item.expenseId, amount: take });
          item.remaining -= take;
          remaining -= take;
          if (item.expenseId) {
            const ep = byExpense.get(item.expenseId)!;
            ep.paid += take;
            ep.pending -= take;
            ep.parts.push({ paymentId: p.id, amount: take, date: p.date });
          }
        }
        if (item.remaining <= 0) cursor++;
      }
      paidSoFar += p.amount;
      byPayment.set(p.id, { payment: p, covers, surplus: remaining, debtBefore, debtAfter: debtBefore - p.amount });
    }

    const purchasesTotal = purchases.reduce((s, e) => s + e.amount, 0);
    const paymentsTotal = pays.reduce((s, p) => s + p.amount, 0);
    const initialPending = items.find((i) => i.expenseId === null)?.remaining ?? 0;
    const pending = purchases
      .map((expense) => ({ expense, pending: byExpense.get(expense.id)?.pending ?? expense.amount }))
      .filter((x) => x.pending > 0);
    status.push({ account, initialDebt, initialPending, purchases: purchasesTotal, payments: paymentsTotal, debt: initialDebt + purchasesTotal - paymentsTotal, pending });
  }

  const totalDebt = status.reduce((s, st) => s + Math.max(0, st.debt), 0);
  return { byExpense, byPayment, status, totalDebt };
}

/**
 * An expense as it counts toward spending. A purchase paid directly is itself; a
 * credit purchase becomes one item per payment that covered it, dated on the
 * payment, keeping its category. `via` marks those slices.
 */
export interface SpendItem extends Expense {
  via?: { paymentId: string; expenseId: string; original: number };
}

/** Everything that counts as spending, ready for summaries. Pending credit purchases are not here. */
export function spendItems(settings: Settings, expenses: Expense[], payments: Payment[], allocation?: Allocation): SpendItem[] {
  const alloc = allocation ?? allocate(settings, expenses, payments);
  const out: SpendItem[] = [];
  for (const e of expenses) {
    if (!isCredit(settings, e.account)) {
      out.push(e);
      continue;
    }
    const paid = alloc.byExpense.get(e.id);
    if (!paid) continue;
    for (const part of paid.parts) {
      out.push({ ...e, id: `${e.id}:${part.paymentId}`, amount: part.amount, date: part.date, via: { paymentId: part.paymentId, expenseId: e.id, original: e.amount } });
    }
  }
  return out;
}
