import { useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../domain/types";
import type { AccountState } from "../cloud/useAccount";
import { mailboxSource, useMailbox, type UnmatchedMessage } from "../cloud/inbox/useMailbox";
import { timeAgo } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  account: AccountState;
  settings: Settings;
  /** Looks for new purchases right away. */
  onCheckNow: () => void;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Text with its web links made tappable (Gmail's confirmation link arrives this way). */
function withLinks(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part.replace(/[.,)\]]+$/, "")} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * Setting up the mailbox that feeds the inbox: its status, its key, the code
 * to paste in Val Town, the cards it recognises and the emails it could not read.
 */
export function MailboxSheet({ open, onClose, account, settings, onCheckNow }: Props) {
  const mailbox = useMailbox(account, open);
  const { state } = mailbox;
  const [code, setCode] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Loaded ahead, so "Copiar" can write to the clipboard inside the tap itself (iOS asks for that).
  useEffect(() => {
    if (open && !code) mailboxSource().then(setCode, () => setCode(null));
  }, [open, code]);
  useEffect(() => {
    if (!open) {
      setNewKey(null);
      setNote(null);
    }
  }, [open]);
  const key = state.status === "ready" ? state.key : null;
  useEffect(() => setAddress(key?.address ?? ""), [key?.address]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? null : n)), 2500);
  };

  const createKey = async () => {
    if (key && !confirm("La clave actual dejará de servir. Tendrás que poner la nueva en Val Town. ¿Continuar?")) return;
    setBusy(true);
    try {
      setNewKey(await mailbox.createKey());
    } catch (err) {
      alert(`No pude crear la clave: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const cards = settings.accounts.flatMap((a) => (a.cards ?? []).map((last4) => ({ last4, account: a })));
  const lastSeen = state.status === "ready" ? (key?.lastUsedAt ?? null) : null;

  return (
    <Sheet title="Bandeja automática" open={open} onClose={onClose} fill>
      <p className="hint">El buzón recibe los correos del banco y deja cada compra en tu bandeja para que la confirmes aquí.</p>

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
          <div className={`account-card sync ${!key ? "sync--wait" : lastSeen ? "" : "sync--wait"}`} role="status">
            <i className="sync__dot" aria-hidden="true" />
            <div>
              <span className="sync__title">{!key ? "Sin configurar" : lastSeen ? "Conectada" : "Esperando el primer correo"}</span>
              <span className="sync__detail">
                {!key
                  ? "Crea una clave y sigue los pasos de abajo."
                  : lastSeen
                    ? `Último correo recibido ${timeAgo(Date.parse(lastSeen))}`
                    : "La clave está lista; falta que el buzón reciba algo."}
              </span>
              {state.lastNoticeAt && <span className="sync__detail">Última compra en la bandeja {timeAgo(Date.parse(state.lastNoticeAt))}</span>}
            </div>
          </div>

          <section className="section">
            <label className="field">
              <span>Dirección del buzón</span>
              <input
                type="email"
                value={address}
                placeholder="tu-buzon@valtown.email"
                disabled={!key}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => address !== (key?.address ?? "") && void mailbox.saveAddress(address)}
              />
              <small className="field__hint">La del val en Val Town. Es a donde Gmail reenvía los correos del banco.</small>
            </label>
          </section>

          <section className="section">
            <h3>Clave</h3>
            {newKey ? (
              <>
                <div className="secret">
                  <code>{newKey}</code>
                </div>
                <p className="hint">Cópiala ahora: por seguridad no se vuelve a mostrar. Va en Val Town como variable de entorno CONTAME_CLAVE.</p>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={async () => flash((await copy(newKey)) ? "Clave copiada" : "No pude copiar; selecciónala y cópiala")}>
                    Copiar clave
                  </button>
                </div>
              </>
            ) : key ? (
              <>
                <div className="secret secret--hidden">••••••••••••</div>
                <p className="hint">Creada {timeAgo(Date.parse(key.createdAt))}. Solo sirve para dejar compras en tu bandeja, no para leer tus datos.</p>
                <div className="btn-row">
                  <button className="btn" onClick={createKey} disabled={busy}>
                    Cambiar clave
                  </button>
                </div>
              </>
            ) : (
              <div className="btn-row">
                <button className="btn btn--primary" onClick={createKey} disabled={busy}>
                  Crear clave
                </button>
              </div>
            )}
          </section>

          <section className="section">
            <h3>Código para Val Town</h3>
            <p className="hint">Es el buzón: se pega en un val con disparador de correo. No lleva nada secreto.</p>
            <div className="btn-row">
              <button className="btn" disabled={!code} onClick={async () => flash(code && (await copy(code)) ? "Código copiado" : "No pude copiar el código")}>
                Copiar código
              </button>
            </div>
            <details className="steps">
              <summary>Cómo conectarlo</summary>
              <ol>
                <li>Crea la clave aquí arriba y cópiala.</li>
                <li>
                  En <a href="https://www.val.town" target="_blank" rel="noreferrer">val.town</a> crea un val nuevo con disparador <b>Email</b> y pega el código.
                </li>
                <li>
                  En las variables de entorno (Environment variables) agrega <b>CONTAME_CLAVE</b> con la clave.
                </li>
                <li>Copia la dirección de correo del val y ponla arriba, en Dirección del buzón.</li>
                <li>
                  En Gmail desde el navegador (versión de escritorio): Configuración → Reenvío y correo POP/IMAP → Agregar una dirección de reenvío, con la del val. El
                  enlace para confirmarlo llega abajo, en "Correos que no entendí".
                </li>
                <li>Crea un filtro para los correos de compras del banco con la acción "Reenviarlo a" la dirección del val.</li>
              </ol>
              <p className="hint">Para probar sin filtro: reenvía a mano un correo de compra a la dirección del val.</p>
            </details>
          </section>

          {cards.length > 0 && (
            <section className="section">
              <h3>Tarjetas reconocidas</h3>
              <ul className="list cards-list">
                {cards.map((c) => (
                  <li key={c.last4} className="cards-list__row">
                    <span>Termina en {c.last4}</span>
                    <span>
                      {c.account.emoji} {c.account.name}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">Se editan en cada cuenta, o al confirmar un movimiento de una tarjeta nueva.</p>
            </section>
          )}

          {state.unmatched.length > 0 && (
            <section className="section">
              <h3>Correos que no entendí</h3>
              <ul className="unmatched">
                {state.unmatched.map((m) => (
                  <Unmatched key={m.id} message={m} onDismiss={() => void mailbox.dismiss(m.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {note && (
        <p className="toast" role="status">
          {note}
        </p>
      )}

      <div className="btn-row mailbox__footer">
        <button
          className="btn btn--block"
          onClick={() => {
            onCheckNow();
            void mailbox.reload();
          }}
        >
          Revisar ahora
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
        <p className="unmatched__body">{withLinks(message.body)}</p>
        <button className="chip-btn chip-btn--danger" onClick={onDismiss}>
          Quitar
        </button>
      </details>
    </li>
  );
}
