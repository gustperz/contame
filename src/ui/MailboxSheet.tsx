import type { Settings } from "../domain/types";
import type { AccountState } from "../cloud/useAccount";
import { useMailbox, type UnmatchedMessage } from "../cloud/inbox/useMailbox";
import { humanDate, timeAgo } from "../utils/dates";
import { bankName } from "../domain/inbox";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  account: AccountState;
  settings: Settings;
  /** Looks for new purchases right away. */
  onCheckNow: () => void;
}

/** "de ayer", "del dom 27 sep". */
function ofDay(day: string): string {
  const h = humanDate(day);
  return h === "Hoy" ? "de hoy" : h === "Ayer" ? "de ayer" : `del ${h.toLowerCase()}`;
}

/** A review older than this means the last daily run did not happen. */
const STALE_MS = 30 * 3_600_000;

/**
 * The daily email review: every morning a scheduled Claude routine reads the
 * previous day's email and leaves the payments in the inbox. This shows when
 * it last ran, the cards and banks that place purchases on accounts, and the
 * emails it could not turn into a purchase.
 */
export function MailboxSheet({ open, onClose, account, settings, onCheckNow }: Props) {
  const mailbox = useMailbox(account, open);
  const { state } = mailbox;
  const run = state.status === "ready" ? state.lastRun : null;
  const stale = run ? Date.now() - Date.parse(run.ranAt) > STALE_MS : false;

  const recognised = settings.accounts.flatMap((a) => [
    ...(a.cards ?? []).map((last4) => ({ key: `card:${last4}`, label: `Tarjeta terminada en ${last4}`, account: a })),
    ...(a.sources ?? []).map((bank) => ({ key: `bank:${bank}:${a.id}`, label: `Avisos de ${bankName(bank)}`, account: a })),
  ]);
  const payments = (n: number) => (n === 1 ? "1 pago" : `${n} pagos`);

  return (
    <Sheet title="Bandeja automática" open={open} onClose={onClose} fill>
      <p className="hint">
        Todos los días a las 5 a. m., Claude revisa tus correos del día anterior y deja aquí los pagos que encuentre para que los confirmes. Solo lee y
        anota: no responde correos, no abre adjuntos ni sigue instrucciones que vengan en ellos.
      </p>

      {state.status === "loading" && <p className="hint">Cargando…</p>}
      {state.status === "error" && (
        <div className="account-card sync sync--bad" role="status">
          <i className="sync__dot" aria-hidden="true" />
          <div>
            <span className="sync__title">No pude conectarme</span>
            <span className="sync__detail">{state.message}</span>
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className={`account-card sync ${!run || stale ? "sync--wait" : ""}`} role="status">
            <i className="sync__dot" aria-hidden="true" />
            <div>
              <span className="sync__title">{!run ? "Aún no ha revisado" : stale ? "La última revisión fue hace más de un día" : "Revisión al día"}</span>
              {run ? (
                <>
                  <span className="sync__detail">
                    Revisó los correos {ofDay(run.day)} {timeAgo(Date.parse(run.ranAt))}: {run.emailsSeen}{" "}
                    {run.emailsSeen === 1 ? "correo" : "correos"}, {payments(run.paymentsAdded)} nuevos.
                  </span>
                  {run.note && <span className="sync__detail">{run.note}</span>}
                </>
              ) : (
                <span className="sync__detail">La primera revisión aparece aquí después de las 5 a. m.</span>
              )}
            </div>
          </div>

          {recognised.length > 0 && (
            <section className="section">
              <h3>Tarjetas y bancos reconocidos</h3>
              <ul className="list cards-list">
                {recognised.map((c) => (
                  <li key={c.key} className="cards-list__row">
                    <span>{c.label}</span>
                    <span>
                      {c.account.emoji} {c.account.name}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Se editan en cada cuenta, o al confirmar un movimiento. Si no hay nada asociado, la cuenta se reconoce por su nombre ("Nequi", "Banco Bogotá").
              </p>
            </section>
          )}

          {state.unmatched.length > 0 && (
            <section className="section">
              <h3>Correos que no pude registrar</h3>
              <p className="hint">Parecían pagos pero les faltaba algo para anotarlos (el monto, la fecha). Si es un gasto, anótalo a mano.</p>
              <ul className="unmatched">
                {state.unmatched.map((m) => (
                  <Unmatched key={m.id} message={m} onDismiss={() => void mailbox.dismiss(m.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="btn-row mailbox__footer">
        <button
          className="btn btn--block"
          onClick={() => {
            onCheckNow();
            void mailbox.reload();
          }}
        >
          Actualizar
        </button>
      </div>
    </Sheet>
  );
}

function Unmatched({ message, onDismiss }: { message: UnmatchedMessage; onDismiss: () => void }) {
  return (
    <li className="unmatched__item">
      <details>
        <summary>
          <span className="unmatched__subject">{message.subject || "(sin asunto)"}</span>
          <span className="unmatched__meta">
            {message.sender ?? "?"} · {timeAgo(Date.parse(message.receivedAt))}
          </span>
        </summary>
        <p className="unmatched__body">{message.body}</p>
        <button className="chip-btn chip-btn--danger" onClick={onDismiss}>
          Quitar
        </button>
      </details>
    </li>
  );
}

