import { useCallback, useMemo, useState } from "react";
import type { Expense, ISODate } from "../domain/types";
import { useApp } from "../storage/useApp";
import { filterExpenses, summarize } from "../domain/summary";
import { rangeForPeriod, toISODate } from "../utils/dates";
import { formatCompact } from "../utils/money";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { SummarySheet } from "./SummarySheet";
import { SettingsSheet } from "./SettingsSheet";
import { EditExpenseDialog } from "./EditExpenseDialog";
import { ChartIcon, SettingsIcon } from "./icons";

export function App() {
  const app = useApp();
  const { state, expensesById } = app;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  /** Date applied to new expenses that do not mention one; null means today. */
  const [pinnedDate, setPinnedDate] = useState<ISODate | null>(null);

  const pinDate = useCallback((date: ISODate | null) => {
    setPinnedDate(date && date !== toISODate(new Date()) ? date : null);
  }, []);

  const onSend = useCallback(
    (text: string) => {
      const parsed = app.send(text, pinnedDate);
      if (parsed.intent === "setDate") pinDate(parsed.date);
    },
    [app, pinnedDate, pinDate],
  );

  const todayTotal = useMemo(() => summarize(filterExpenses(state.expenses, rangeForPeriod("today"))).total, [state.expenses]);
  const monthTotal = useMemo(() => summarize(filterExpenses(state.expenses, rangeForPeriod("month"))).total, [state.expenses]);

  const onDelete = useCallback(
    (e: Expense) => {
      if (confirm(`¿Eliminar "${e.description}"?`)) app.deleteExpense(e.id);
    },
    [app],
  );

  const currency = state.settings.currency;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Contame</h1>
          <p className="topbar__sub">
            Hoy <strong>{formatCompact(todayTotal, currency)}</strong>
            <span className="dot">·</span>
            Mes <strong>{formatCompact(monthTotal, currency)}</strong>
          </p>
        </div>
        <div className="topbar__actions">
          <button className="icon-btn" onClick={() => setSummaryOpen(true)} aria-label="Resumen">
            <ChartIcon />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <SettingsIcon />
          </button>
        </div>
      </header>

      <main className="main">
        <Chat messages={state.messages} expensesById={expensesById} currency={currency} onEdit={setEditing} onDelete={onDelete} />
      </main>

      <Composer onSend={onSend} showSuggestions={state.expenses.length === 0} pinnedDate={pinnedDate} onPinDate={pinDate} />

      <SummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        expenses={state.expenses}
        currency={currency}
        onEdit={setEditing}
        onDelete={onDelete}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        onSettings={app.setSettings}
        onImport={app.importState}
        onClear={app.clearAll}
      />
      <EditExpenseDialog
        expense={editing}
        currency={currency}
        onSave={app.updateExpense}
        onDelete={(e) => app.deleteExpense(e.id)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
