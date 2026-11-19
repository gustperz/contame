/**
 * Signing in when the email link was opened instead of copied.
 *
 * Supabase's email brings a link, and a phone's mail app opens it at once in
 * the browser, whose storage is separate from the app installed on the home
 * screen. The link lands on Contame with the new session in the address
 * (`#access_token=…&refresh_token=…`). Instead of keeping that session in the
 * browser, the page offers it as an access code to copy; pasted into the
 * installed app, it becomes the session there.
 */

const PREFIX = "contame-acceso:";

export type Arrival =
  /** The link worked: a session to hand over, or to use right here. */
  | { ok: true; accessToken: string; refreshToken: string }
  /** The link was already used or has expired. */
  | { ok: false; message: string };

/** What an opened email link left in the address, or null when the page was opened normally. */
export function readArrival(hash: string): Arrival | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { ok: true, accessToken, refreshToken };
  if (params.get("error") || params.get("error_code")) {
    const expired = /expired|invalid/i.test(`${params.get("error_code")} ${params.get("error_description")}`);
    return { ok: false, message: expired ? "Ese enlace ya se usó o venció. Pide uno nuevo desde la app, con «Reenviar código»." : "No pude entrar con ese enlace. Pide uno nuevo desde la app." };
  }
  return null;
}

/** The code to copy in the browser and paste in the installed app. */
export function accessCode(refreshToken: string): string {
  return `${PREFIX}${refreshToken}`;
}

/** The session key inside a pasted access code, or null when the text is something else. */
export function parseAccessCode(text: string): string | null {
  const m = /contame-acceso:([A-Za-z0-9_-]{6,})/.exec(text.trim());
  return m ? m[1] : null;
}

/** True when running as the app installed on the home screen, not in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
