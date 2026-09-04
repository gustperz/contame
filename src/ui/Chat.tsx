import { useEffect, useRef } from "react";
import type { ChatMessage, Expense } from "../domain/types";
import { humanDate, toISODate } from "../utils/dates";
import { ExpenseCard } from "./ExpenseCard";

interface Props {
  messages: ChatMessage[];
  expensesById: Map<string, Expense>;
  currency: string;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function Chat({ messages, expensesById, currency, onEdit, onDelete }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  let lastDay = "";
  return (
    <div className="chat" role="log" aria-live="polite">
      {messages.map((m) => {
        const day = toISODate(new Date(m.createdAt));
        const divider = day !== lastDay ? <div className="day-divider" key={`d-${day}`}><span>{humanDate(day)}</span></div> : null;
        lastDay = day;
        return (
          <div key={m.id} className="msg-wrap">
            {divider}
            <Bubble message={m} expensesById={expensesById} currency={currency} onEdit={onEdit} onDelete={onDelete} />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

interface BubbleProps {
  message: ChatMessage;
  expensesById: Map<string, Expense>;
  currency: string;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

function Bubble({ message, expensesById, currency, onEdit, onDelete }: BubbleProps) {
  const isUser = message.role === "user";
  const expenses = (message.expenseIds ?? []).map((id) => expensesById.get(id)).filter((e): e is Expense => !!e);
  const removed = (message.expenseIds?.length ?? 0) - expenses.length;
  return (
    <div className={`bubble-row ${isUser ? "bubble-row--user" : "bubble-row--app"}`}>
      <div className={`bubble ${isUser ? "bubble--user" : "bubble--app"} ${message.kind ? `bubble--${message.kind}` : ""}`}>
        <p className="bubble__text">{message.text}</p>
        {expenses.length > 0 && (
          <div className="bubble__expenses">
            {expenses.map((e) => (
              <ExpenseCard key={e.id} expense={e} currency={currency} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        )}
        {removed > 0 && <p className="bubble__note">{removed === 1 ? "Gasto eliminado" : `${removed} gastos eliminados`}</p>}
        <time className="bubble__time" dateTime={new Date(message.createdAt).toISOString()}>
          {timeOf(message.createdAt)}
        </time>
      </div>
    </div>
  );
}
