/** The pieces of the Apps Script project, as the build hands them to the app. */
export interface MailboxParts {
  /** Code.js: the functions the person runs and the trigger calls. */
  code: string;
  /** appsscript.json: read-only Gmail access and the Gmail service. */
  manifest: string;
  /** The notice parser and delivery, bundled as `var ContameMailbox`. */
  lib: string;
}

/**
 * The single file to paste as Code.gs: a Spanish note for the person, the
 * project settings and the mailbox key, the mailbox itself and, at the bottom,
 * the shared code. The key sits in the person's own private script.
 */
export function assembleScript(parts: MailboxParts, config: { url: string; key: string; token: string }): string {
  return [
    "// Contame · buzón en Google Apps Script.",
    "// Revisa tu Gmail cada 5 minutos y deja las compras del banco en tu bandeja de Contame.",
    "// Después de pegarlo, elige la función install y toca Ejecutar (solo una vez).",
    "// La clave de abajo solo sirve para dejar compras en tu bandeja; no la compartas.",
    `var CONTAME = ${JSON.stringify(config, null, 2)};`,
    "",
    parts.code.trim(),
    "",
    "// ——— Código compartido de Contame (lector de avisos). No hace falta tocarlo. ———",
    parts.lib.trim(),
    "",
  ].join("\n");
}
