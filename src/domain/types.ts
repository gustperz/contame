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

export interface Expense {
  id: string;
  amount: number;
  category: CategoryId;
  description: string;
  date: ISODate;
  createdAt: number;
  /** The original chat message that produced this expense. */
  source?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "app";
  text: string;
  createdAt: number;
  /** Expenses created by this message (for app replies, the ones it confirms). */
  expenseIds?: string[];
  kind?: "expense" | "query" | "error" | "info" | "undo";
}

export type Period = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "all";

export interface ExpenseDraft {
  amount: number;
  category: CategoryId;
  description: string;
  date: ISODate;
  source: string;
}

export type ParsedMessage =
  | { intent: "expense"; expenses: ExpenseDraft[] }
  | { intent: "query"; period: Period | null; category: CategoryId | null }
  | { intent: "undo" }
  | { intent: "help" }
  | { intent: "unknown"; reason: "no-amount" };

export interface Settings {
  currency: string;
}
