/**
 * Contame · mailbox for Val Town (email trigger).
 *
 * Receives the bank's emails (forwarded from Gmail) and leaves each purchase
 * in the Contame inbox to be confirmed. Needs one environment variable:
 * CONTAME_CLAVE, the mailbox key created in Contame (Ajustes → Bandeja
 * automática). The app puts the project settings at the top of this file.
 */
import { emailText, type IncomingEmail } from "../src/email";
import { deliver } from "../src/receiver";

declare const Deno: { env: { get(name: string): string | undefined } };
/** Injected by the app when it copies this code: the project's public URL and key. */
declare const CONTAME: { url: string; key: string };

export default async function receiveEmail(email: IncomingEmail): Promise<void> {
  const token = Deno.env.get("CONTAME_CLAVE");
  if (!token) {
    console.error("Falta la variable de entorno CONTAME_CLAVE con la clave del buzón de Contame.");
    return;
  }
  const text = emailText(email);
  const result = await deliver({ text, sender: email.from, subject: email.subject }, { ...CONTAME, token });
  if (result.status === "unmatched") {
    // Also in the logs, which is where Gmail's forwarding confirmation link shows up.
    console.log(`No es un aviso de compra: "${email.subject ?? ""}" de ${email.from ?? "?"}\n\n${text}`);
  } else {
    console.log(`Compra en ${result.merchant} por ${result.amount}: ${result.status}`);
  }
}
