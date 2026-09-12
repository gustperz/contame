export type CategoryId =
  | "comida"
  | "mercado"
  | "transporte"
  | "casa"
  | "salud"
  | "entretenimiento"
  | "ropa"
  | "educacion"
  | "regalos"
  | "mascotas"
  | "suscripciones"
  | "otros";

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  keywords: string[];
}

/** ISO date without time, in the user's local timezone: "2026-09-04". */
export type ISODate = string;

export interface Account {
  id: string;
  name: string;
  emoji: string;
  /** Words that name this account in a message ("nequi", "tarjeta", "tc"). */
  aliases: string[];
  /** A credit card: purchases stay pending and count as spending only when the card is paid. */
  credit?: boolean;
  /** What was owed on the card before using the app; paid first by the first payments. */
  initialDebt?: number;
}

/** Money moved to a credit card to pay it off. Not a spend by itself. */
export interface Payment {
  id: string;
  amount: number;
  /** Credit account that was paid. */
  toAccount: string;
  /** Where the money came from; undefined when not said. */
  fromAccount?: string;
  date: ISODate;
  createdAt: number;
  source?: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: CategoryId;
  /** Account id; undefined means no account associated. */
  account?: string;
  description: string;
  date: ISODate;
  createdAt: number;
  /** The original chat message that produced this expense. */
  source?: string;
  /** Number of installments the purchase was made in (informational). */
  installments?: number;
}

export type MessageKind = "expense" | "payment" | "plain" | "query" | "undo" | "help";

/**
 * A line in the user's own log. There is no assistant: an "expense" message is
 * rendered as its expense cards, a "plain" one is text that could not be parsed,
 * and "query"/"undo"/"help" carry the computed note in `note`.
 */
export interface ChatMessage {
  id: string;
  /** What the user typed. */
  text: string;
  createdAt: number;
  kind: MessageKind;
  /** Expenses created by this message. */
  expenseIds?: string[];
  /** Payment created by this message. */
  paymentId?: string;
  /** Computed content for query/undo/help messages. */
  note?: string;
  /** Day the line belongs to when it is not an expense (e.g. text written with a pinned date). */
  date?: ISODate;
}

export type Period = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "all";

export interface ExpenseDraft {
  amount: number;
  category: CategoryId;
  account?: string;
  description: string;
  date: ISODate;
  source: string;
  installments?: number;
}

export interface PaymentDraft {
  amount: number;
  toAccount: string;
  fromAccount: string | null;
  date: ISODate;
  source: string;
}

export type ParsedMessage =
  | { intent: "expense"; expenses: ExpenseDraft[] }
  | { intent: "payment"; payment: PaymentDraft }
  | { intent: "query"; period: Period | null; category: CategoryId | null; account: string | null; debt?: boolean }
  | { intent: "undo" }
  | { intent: "help" }
  | { intent: "setDate"; date: ISODate }
  | { intent: "setAccount"; account: string }
  | { intent: "unknown"; reason: "no-amount" };

export interface Settings {
  currency: string;
  accounts: Account[];
  /** Optional account for expenses that do not name one; undefined leaves them without account. */
  defaultAccount?: string;
}
