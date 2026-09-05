import { useEffect, useRef } from "react";
import type { ChatMessage, Expense, Settings } from "../domain/types";
import { humanDate, toISODate } from "../utils/dates";
import { ExpenseCard } from "./ExpenseCard";
import { CloseIcon } from "./icons";

interface Props {
  messages: ChatMessage[];
  expensesById: Map<string, Expense>;
  currency: string;
  settings: Settings;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onEditPlain: (m: ChatMessage) => void;
  onDeleteMessage: (m: ChatMessage) => void;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function Chat({ messages, expensesById, currency, settings, onEdit, onDelete, onEditPlain, onDeleteMessage }: Props) {
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

  const items = buildTimeline(messages, expensesById);
  let lastDay = "";
  return (
    <div className="chat" role="log" aria-live="polite">
      {items.map((item) => {
        const divider = item.date !== lastDay ? <div className="day-divider"><span>{humanDate(item.date)}</span></div> : null;
        lastDay = item.date;
        return (
          <div key={item.key} className="msg-wrap">
            {divider}
            {item.type === "expense" ? (
              <div className="line line--cards">
                <ExpenseCard expense={item.expense} currency={currency} settings={settings} onEdit={onEdit} onDelete={onDelete} showDate={false} actions={false} />
                <div className="line__meta">{timeEl(item.expense.createdAt)}</div>
              </div>
            ) : (
              <Line message={item.message} onEditPlain={onEditPlain} onDeleteMessage={onDeleteMessage} />
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

type TimelineItem =
  | { type: "expense"; key: string; date: string; sort: number; expense: Expense }
  | { type: "message"; key: string; date: string; sort: number; message: ChatMessage };

/**
 * The log is ordered by the date each entry belongs to, not by when it was typed:
 * an expense edited to yesterday moves under "Ayer", and "ayer 20k taxi" lands there directly.
 */
function buildTimeline(messages: ChatMessage[], expensesById: Map<string, Expense>): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const m of messages) {
    const ownDay = m.date ?? toISODate(new Date(m.createdAt));
    if (m.kind === "expense") {
      const expenses = (m.expenseIds ?? []).map((id) => expensesById.get(id)).filter((e): e is Expense => !!e);
      for (const e of expenses) items.push({ type: "expense", key: e.id, date: e.date, sort: e.createdAt, expense: e });
      const removed = (m.expenseIds?.length ?? 0) - expenses.length;
      if (removed > 0 && expenses.length === 0) {
        items.push({ type: "message", key: m.id, date: ownDay, sort: m.createdAt, message: m });
      }
      continue;
    }
    items.push({ type: "message", key: m.id, date: ownDay, sort: m.createdAt, message: m });
  }
  return items.sort((a, b) => (a.date === b.date ? a.sort - b.sort : a.date < b.date ? -1 : 1));
}

function timeEl(ts: number) {
  return (
    <time className="line__time" dateTime={new Date(ts).toISOString()}>
      {timeOf(ts)}
    </time>
  );
}

interface LineProps {
  message: ChatMessage;
  onEditPlain: (m: ChatMessage) => void;
  onDeleteMessage: (m: ChatMessage) => void;
}

function Line({ message, onEditPlain, onDeleteMessage }: LineProps) {
  const remove = (
    <button className="line__remove" onClick={() => onDeleteMessage(message)} aria-label="Quitar del registro">
      <CloseIcon width={14} height={14} />
    </button>
  );
  const time = (
    <time className="line__time" dateTime={new Date(message.createdAt).toISOString()}>
      {timeOf(message.createdAt)}
    </time>
  );

  switch (message.kind) {
    case "expense": {
      // Live expenses are rendered by the timeline; this line only remains when all were deleted.
      const removed = message.expenseIds?.length ?? 0;
      return (
        <div className="line line--system">
          <span className="line__system">{removed === 1 ? "Gasto eliminado" : `${removed} gastos eliminados`}</span>
          {remove}
        </div>
      );
    }
    case "plain":
      return (
        <div className="line line--plain">
          <button className="bubble bubble--tappable" onClick={() => onEditPlain(message)} aria-label={`Completar gasto: ${message.text}`}>
            <p className="bubble__text">{message.text}</p>
            <span className="bubble__hint">Sin monto · toca para completar</span>
            {time}
          </button>
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
            {remove}
          </div>
        </div>
      );
    case "undo":
      return (
        <div className="line line--system">
          <span className="line__system">{message.note}</span>
          {remove}
        </div>
      );
  }
}
