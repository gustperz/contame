/** Which notice a transaction came from. Every bank has its own template. */
export type SourceKind = "lulo-email" | "lulo-sms" | "bogota-sms" | "bogota-pse";

/**
 * A purchase read from a notice. Date and time are kept as the bank reports
 * them, in local time and with no timezone conversion: they are the time of the
 * purchase rather than of the message, and that is what duplicates match on.
 */
export interface Transaction {
  amount: number;
  merchant: string;
  /** Last four digits of the card; null when the notice does not carry them. */
  last4: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24 hour */
  time: string;
  /** The notice explicitly says it was a credit card. */
  credit: boolean;
}
