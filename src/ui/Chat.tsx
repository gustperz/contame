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

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden>
          💬
        </div>
        <h2>Cuéntate tus gastos</h2>
        <p>
          Escribe lo que gastaste tal como se lo contarías a alguien. Cada mensaje se convierte en un gasto.
        </p>
        <p className="empty-state__hint">Escribe “ayuda” para ver todo lo que se entiende.</p>
      </div>
    );
  }

  let lastDay = "";
  return (
    <div className="chat" role="log" aria-live="polite">
      {messages.map((m) => {
        const day = toISODate(new Date(m.createdAt));
        const divider = day !== lastDay ? <div className="day-divider"><span>{humanDate(day)}</span></div> : null;
        lastDay = day;
        return (
          <div key={m.id} className="msg-wrap">
            {divider}
            <Line message={m} expensesById={expensesById} currency={currency} onEdit={onEdit} onDelete={onDelete} />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

interface LineProps {
  message: ChatMessage;
  expensesById: Map<string, Expense>;
  currency: string;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

function Line({ message, expensesById, currency, onEdit, onDelete }: LineProps) {
  const time = (
    <time className="line__time" dateTime={new Date(message.createdAt).toISOString()}>
      {timeOf(message.createdAt)}
    </time>
  );

  switch (message.kind) {
    case "expense": {
      const expenses = (message.expenseIds ?? []).map((id) => expensesById.get(id)).filter((e): e is Expense => !!e);
      const removed = (message.expenseIds?.length ?? 0) - expenses.length;
      if (expenses.length === 0) {
        return (
          <div className="line line--system">
            <span className="line__system">{removed === 1 ? "Gasto eliminado" : `${removed} gastos eliminados`}</span>
          </div>
        );
      }
      return (
        <div className="line line--cards">
          {expenses.map((e) => (
            <ExpenseCard key={e.id} expense={e} currency={currency} onEdit={onEdit} onDelete={onDelete} actions={false} />
          ))}
          <div className="line__meta">
            {removed > 0 && <span className="line__system">{removed === 1 ? "1 gasto eliminado" : `${removed} gastos eliminados`}</span>}
            {time}
          </div>
        </div>
      );
    }
    case "plain":
      return (
        <div className="line line--plain">
          <div className="bubble">
            <p className="bubble__text">{message.text}</p>
            {time}
          </div>
        </div>
      );
    case "query":
    case "help":
      return (
        <div className="line line--note">
          <div className="note">
            <p className="note__question">{message.text}</p>
            <p className="note__body">{message.note}</p>
            {time}
          </div>
        </div>
      );
    case "undo":
      return (
        <div className="line line--system">
          <span className="line__system">{message.note}</span>
        </div>
      );
  }
}
