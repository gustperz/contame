import { useRef } from "react";
import type { Account, Settings } from "../domain/types";
import { newAccountId } from "../domain/accounts";
import { TrashIcon } from "./icons";
import { CURRENCIES } from "../utils/money";
import { Sheet } from "./Sheet";
import { downloadFile, jsonToState, stateToJson } from "../storage/export";
import type { AppState } from "../storage/store";

interface Props {
  open: boolean;
  onClose: () => void;
  state: AppState;
  onSettings: (s: Partial<Settings>) => void;
  onAccounts: (accounts: Account[], defaultAccount: string) => void;
  onImport: (s: AppState) => void;
  onClear: () => void;
}

export function SettingsSheet({ open, onClose, state, onSettings, onAccounts, onImport, onClear }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    try {
      const imported = jsonToState(await file.text());
      const ok = confirm(`El respaldo tiene ${imported.expenses.length} gastos. Reemplazará los datos actuales (${state.expenses.length} gastos). ¿Continuar?`);
      if (ok) {
        onImport(imported);
        onClose();
      }
    } catch (err) {
      alert(`No pude leer el archivo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Sheet title="Ajustes" open={open} onClose={onClose}>
      <section className="section">
        <label className="field">
          <span>Moneda</span>
          <select value={state.settings.currency} onChange={(e) => onSettings({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <AccountsEditor settings={state.settings} onChange={onAccounts} />

      <section className="section">
        <h3>Tus datos</h3>
        <p className="hint">
          Todo se guarda solo en este dispositivo, dentro del navegador. Haz un respaldo de vez en cuando para no perder nada si cambias de teléfono o borras los datos del navegador.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => downloadFile(`contame-respaldo-${new Date().toISOString().slice(0, 10)}.json`, stateToJson(state), "application/json")}>
            Descargar respaldo
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restaurar respaldo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </div>
      </section>

      <section className="section">
        <h3>Zona de peligro</h3>
        <button
          className="btn btn--danger"
          onClick={() => {
            if (confirm("¿Borrar todos los gastos y la conversación? Esta acción no se puede deshacer.")) {
              onClear();
              onClose();
            }
          }}
        >
          Borrar todo
        </button>
      </section>

      <section className="section about">
        <p className="hint">
          Contame · {state.expenses.length} gastos registrados. Escribe “ayuda” en el chat para ver ejemplos de lo que entiendo.
        </p>
      </section>
    </Sheet>
  );
}

interface AccountsEditorProps {
  settings: Settings;
  onChange: (accounts: Account[], defaultAccount: string) => void;
}

function AccountsEditor({ settings, onChange }: AccountsEditorProps) {
  const { accounts, defaultAccount } = settings;
  const update = (id: string, patch: Partial<Account>) =>
    onChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)), defaultAccount);
  const remove = (a: Account) => {
    if (accounts.length === 1) return;
    if (!confirm(`¿Eliminar la cuenta "${a.name}"? Sus gastos pasarán a la cuenta predeterminada.`)) return;
    const rest = accounts.filter((x) => x.id !== a.id);
    onChange(rest, defaultAccount === a.id ? rest[0].id : defaultAccount);
  };
  const add = () => {
    const name = prompt("Nombre de la cuenta (por ejemplo: Daviplata)");
    if (!name?.trim()) return;
    const id = newAccountId(name, accounts);
    onChange([...accounts, { id, name: name.trim(), emoji: "💳", aliases: [name.trim().toLowerCase()] }], defaultAccount);
  };

  return (
    <section className="section">
      <h3>Cuentas</h3>
      <p className="hint">
        Nombra la cuenta en el mensaje ("almuerzo 15 mil con nequi") o escribe solo su nombre para dejarla fija. Los alias son las palabras que la identifican, separadas por comas.
      </p>
      <ul className="accounts">
        {accounts.map((a) => (
          <li key={a.id} className="account">
            <div className="account__row">
              <input
                className="account__emoji"
                value={a.emoji}
                onChange={(e) => update(a.id, { emoji: e.target.value.trim() || "💳" })}
                aria-label="Emoji"
                maxLength={4}
              />
              <input className="account__name" value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} aria-label="Nombre" maxLength={40} />
              <label className="account__default">
                <input
                  type="radio"
                  name="default-account"
                  checked={defaultAccount === a.id}
                  onChange={() => onChange(accounts, a.id)}
                />
                Predeterminada
              </label>
              <button className="icon-btn icon-btn--small" onClick={() => remove(a)} aria-label={`Eliminar ${a.name}`} disabled={accounts.length === 1}>
                <TrashIcon />
              </button>
            </div>
            <input
              className="account__aliases"
              value={a.aliases.join(", ")}
              onChange={(e) => update(a.id, { aliases: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              placeholder="alias, separados, por comas"
              aria-label={`Alias de ${a.name}`}
            />
          </li>
        ))}
      </ul>
      <button className="btn" onClick={add}>
        Agregar cuenta
      </button>
    </section>
  );
}
