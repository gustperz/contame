import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, Expense, ISODate, Payment } from "../domain/types";
import { PaymentSheet } from "./PaymentSheet";
import { draftFromText } from "../domain/parser";
import { newId } from "../storage/store";
import { useApp } from "../storage/useApp";
import { filterExpenses, summarize } from "../domain/summary";
import { rangeForPeriod, toISODate } from "../utils/dates";
import { monthKey, monthName, monthOf, periodRange, withStart, type Closing } from "../utils/months";
import { CloseMonthSheet } from "./CloseMonthSheet";
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
import { useSpace } from "../cloud/useSpace";
import { isMine, personOf, settingsOf } from "../domain/people";
import { JoinExpensesSheet } from "./JoinExpensesSheet";
import { useInbox } from "../cloud/inbox/useInbox";
import { expenseIdFor } from "../domain/inbox";
import { InboxSheet } from "./InboxSheet";
import { MailboxSheet } from "./MailboxSheet";
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
  const { space, people } = useSpace(account.state);
  // Set while rendering, so whatever is written next already carries its author.
  app.setPeople(people);
  /** The signed-in person's own accounts and default: what they write with. */
  const mySettings = useMemo(() => settingsOf(state.settings, people.me, people), [state.settings, people]);
  const sync = useSync(state, app.applyRemote, account.state, space?.spaceId ?? null);
  const inbox = useInbox(account.state);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  // A purchase saved on another phone may still show as pending here for a moment.
  const inboxItems = useMemo(() => inbox.items.filter((i) => !expensesById.has(expenseIdFor(i))), [inbox.items, expensesById]);
  const alreadySaved = inbox.items.length - inboxItems.length;
  useEffect(() => {
    if (alreadySaved > 0) inbox.decide(inbox.items.filter((i) => expensesById.has(expenseIdFor(i))).map((i) => i.id), "saved");
  }, [alreadySaved, inbox.items, inbox.decide, expensesById]);
  /** Expense being edited; `messageId` marks a new expense completed from an unparsed message. */
  const [editing, setEditing] = useState<{ expense: Expense; messageId?: string } | null>(null);
  /** A saved expense being joined with others. */
  const [joining, setJoining] = useState<Expense | null>(null);
  const myExpenses = useMemo(() => state.expenses.filter((e) => isMine(e, people)), [state.expenses, people]);
  const editExpense = useCallback((expense: Expense) => setEditing({ expense }), []);
  const editPlain = useCallback((m: ChatMessage) => {
    const draft = draftFromText(m.text, new Date(), m.date, mySettings.accounts);
    setEditing({ expense: { id: newId(), amount: 0, ...draft, account: draft.account ?? mySettings.defaultAccount, createdAt: m.createdAt }, messageId: m.id });
  }, [mySettings]);
  /** Date applied to new expenses that do not mention one; null means today. */
  const [pinnedDate, setPinnedDate] = useState<ISODate | null>(null);
  /** Account applied to new expenses that do not name one; null means the default account. */
  const [pinnedAccount, setPinnedAccount] = useState<string | null>(null);
  // null = use the default account (if any); "" = explicitly no account; otherwise an account id.
  const pinAccount = useCallback(
    (id: string | null) => setPinnedAccount(id !== null && id === (mySettings.defaultAccount ?? "") ? null : id),
    [mySettings.defaultAccount],
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
  const starts = state.settings.monthStarts;
  const monthTotal = useMemo(() => summarize(filterExpenses(spending, periodRange("month", new Date(), starts))).total, [spending, starts]);
  // After closing September on payday, the month spending counts in is already October.
  const countingIn = monthOf(toISODate(new Date()), starts);
  const monthLabel = countingIn === monthKey(new Date()) ? "Mes" : capitalize(monthName(countingIn));
  const [closing, setClosing] = useState<Closing | null>(null);
  const setMonthStart = useCallback(
    (opens: string, date: ISODate | null) => app.setSettings({ monthStarts: withStart(state.settings.monthStarts, opens, date) }),
    [app, state.settings.monthStarts],
  );

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
            {monthLabel} <strong>{formatCompact(monthTotal, currency)}</strong>
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
          people={people}
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
        settings={mySettings}
      />

      <SummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        items={spending}
        currency={currency}
        settings={state.settings}
        people={people}
        onEdit={editExpense}
        onDelete={onDelete}
        onOpenPayment={setOpenPayment}
        onCloseMonth={setClosing}
        onReopenMonth={(opens) => setMonthStart(opens, null)}
      />
      <CloseMonthSheet closing={closing} items={spending} settings={state.settings} onConfirm={setMonthStart} onClose={() => setClosing(null)} />
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
        onOpenMailbox={() => setMailboxOpen(true)}
        onSignIn={() => setSignInOpen(true)}
        people={people}
      />
      <SignInSheet open={signInOpen} onClose={closeSignIn} account={account} />
      <MailboxSheet
        open={mailboxOpen}
        onClose={() => setMailboxOpen(false)}
        account={account.state}
        settings={mySettings}
        onCheckNow={() => void inbox.refresh()}
      />
      <InboxSheet
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        items={inboxItems}
        settings={mySettings}
        expenses={state.expenses}
        currency={currency}
        onSave={(entries) => {
          app.saveInbox(entries);
          inbox.decide(
            entries.flatMap((e) => [e.item.id, ...(e.merged ?? []).map((m) => m.id)]),
            "saved",
          );
        }}
        onDiscard={(item) => inbox.decide([item.id], "discarded")}
      />
      <EditExpenseDialog
        expense={editing?.expense ?? null}
        isNew={!!editing?.messageId}
        currency={currency}
        // An expense keeps to the accounts of whoever wrote it.
        settings={editing ? settingsOf(state.settings, editing.messageId ? people.me : personOf(editing.expense, people), people) : state.settings}
        onSave={(e) => (editing?.messageId ? app.convertMessage(editing.messageId, e) : app.updateExpense(e))}
        onDelete={(e) => (editing?.messageId ? app.deleteMessage(editing.messageId) : app.deleteExpense(e.id))}
        onClose={() => setEditing(null)}
        // Only one's own expenses can be joined.
        onJoin={editing && !editing.messageId && isMine(editing.expense, people) ? (e) => { setEditing(null); setJoining(e); } : undefined}
      />
      <JoinExpensesSheet
        expense={joining ? expensesById.get(joining.id) ?? null : null}
        expenses={myExpenses}
        settings={mySettings}
        currency={currency}
        onJoin={app.joinExpenses}
        onClose={() => setJoining(null)}
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
