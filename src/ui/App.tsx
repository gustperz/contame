import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, Expense, ISODate, Payment } from "../domain/types";
import { PaymentSheet } from "./PaymentSheet";
import { draftFromText } from "../domain/parser";
import { newId } from "../storage/store";
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
import { SignInSheet } from "./SignInSheet";
import { useAccount } from "../cloud/useAccount";
import { useSync } from "../cloud/sync/useSync";
import { useInbox } from "../cloud/inbox/useInbox";
import { expenseIdFor } from "../domain/inbox";
import { InboxSheet } from "./InboxSheet";
import { InboxIcon } from "./icons";

export function App() {
  const app = useApp();
  const { state, expensesById, paymentsById, spending } = app;
  const [openPayment, setOpenPayment] = useState<Payment | null>(null);
  // Keep the open sheet in sync with the stored payment (after an edit).
  const livePayment = openPayment ? paymentsById.get(openPayment.id) ?? null : null;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);
  const account = useAccount();
  const sync = useSync(state, app.applyRemote, account.state);
  const inbox = useInbox(account.state);
  const [inboxOpen, setInboxOpen] = useState(false);
  // A purchase saved on another phone may still show as pending here for a moment.
  const inboxItems = useMemo(() => inbox.items.filter((i) => !expensesById.has(expenseIdFor(i))), [inbox.items, expensesById]);
  const alreadySaved = inbox.items.length - inboxItems.length;
  useEffect(() => {
    if (alreadySaved > 0) inbox.decide(inbox.items.filter((i) => expensesById.has(expenseIdFor(i))).map((i) => i.id), "saved");
  }, [alreadySaved, inbox.items, inbox.decide, expensesById]);
  /** Expense being edited; `messageId` marks a new expense completed from an unparsed message. */
  const [editing, setEditing] = useState<{ expense: Expense; messageId?: string } | null>(null);
  const editExpense = useCallback((expense: Expense) => setEditing({ expense }), []);
  const editPlain = useCallback((m: ChatMessage) => {
    const draft = draftFromText(m.text, new Date(), m.date, state.settings.accounts);
    setEditing({ expense: { id: newId(), amount: 0, ...draft, account: draft.account ?? state.settings.defaultAccount, createdAt: m.createdAt }, messageId: m.id });
  }, [state.settings]);
  /** Date applied to new expenses that do not mention one; null means today. */
  const [pinnedDate, setPinnedDate] = useState<ISODate | null>(null);
  /** Account applied to new expenses that do not name one; null means the default account. */
  const [pinnedAccount, setPinnedAccount] = useState<string | null>(null);
  // null = use the default account (if any); "" = explicitly no account; otherwise an account id.
  const pinAccount = useCallback(
    (id: string | null) => setPinnedAccount(id !== null && id === (state.settings.defaultAccount ?? "") ? null : id),
    [state.settings.defaultAccount],
  );

  const pinDate = useCallback((date: ISODate | null) => {
    setPinnedDate(date && date !== toISODate(new Date()) ? date : null);
  }, []);

  const onSend = useCallback(
    (text: string) => {
      const parsed = app.send(text, pinnedDate, pinnedAccount);
      if (parsed.intent === "setDate") pinDate(parsed.date);
      if (parsed.intent === "setAccount") pinAccount(parsed.account);
    },
    [app, pinnedDate, pinnedAccount, pinDate, pinAccount],
  );

  const todayTotal = useMemo(() => summarize(filterExpenses(spending, rangeForPeriod("today"))).total, [spending]);
  const monthTotal = useMemo(() => summarize(filterExpenses(spending, rangeForPeriod("month"))).total, [spending]);

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
        <Chat
          messages={state.messages}
          expensesById={expensesById}
          paymentsById={paymentsById}
          currency={currency}
          settings={state.settings}
          onEdit={editExpense}
          onOpenPayment={setOpenPayment}
          onDelete={onDelete}
          onEditPlain={editPlain}
          onDeleteMessage={(m) => app.deleteMessage(m.id)}
        />
      </main>

      {inboxItems.length > 0 && (
        <div className="inbox-dock">
          <button className="inbox-pill" onClick={() => setInboxOpen(true)}>
            <InboxIcon width={18} height={18} />
            {inboxItems.length === 1 ? "1 movimiento nuevo" : `${inboxItems.length} movimientos nuevos`}
          </button>
        </div>
      )}

      <Composer
        onSend={onSend}
        showSuggestions={state.expenses.length === 0}
        pinnedDate={pinnedDate}
        onPinDate={pinDate}
        pinnedAccount={pinnedAccount}
        onPinAccount={pinAccount}
        settings={state.settings}
      />

      <SummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        items={spending}
        currency={currency}
        settings={state.settings}
        onEdit={editExpense}
        onDelete={onDelete}
        onOpenPayment={setOpenPayment}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        onSettings={app.setSettings}
        onAccounts={app.updateAccounts}
        onImport={(s) => {
          sync.expectDeletes();
          app.importState(s);
        }}
        onClear={() => {
          sync.expectDeletes();
          app.clearAll();
        }}
        account={account}
        sync={sync}
        onSignIn={() => setSignInOpen(true)}
      />
      <SignInSheet open={signInOpen} onClose={closeSignIn} account={account} />
      <InboxSheet
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        items={inboxItems}
        settings={state.settings}
        expenses={state.expenses}
        currency={currency}
        onSave={(entries) => {
          app.saveInbox(entries);
          inbox.decide(
            entries.map((e) => e.item.id),
            "saved",
          );
        }}
        onDiscard={(item) => inbox.decide([item.id], "discarded")}
      />
      <EditExpenseDialog
        expense={editing?.expense ?? null}
        isNew={!!editing?.messageId}
        currency={currency}
        settings={state.settings}
        onSave={(e) => (editing?.messageId ? app.convertMessage(editing.messageId, e) : app.updateExpense(e))}
        onDelete={(e) => (editing?.messageId ? app.deleteMessage(editing.messageId) : app.deleteExpense(e.id))}
        onClose={() => setEditing(null)}
      />
      <PaymentSheet
        payment={livePayment}
        settings={state.settings}
        currency={currency}
        onSave={app.updatePayment}
        onDelete={(p) => app.deletePayment(p.id)}
        onClose={() => setOpenPayment(null)}
      />
    </div>
  );
}
