import type { EmailOtpType } from "@supabase/supabase-js";

const TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

export interface EmailLink {
  tokenHash: string;
  type: EmailOtpType;
}

/**
 * Reads the sign-in link from Supabase's default email, pasted into the app.
 *
 * That link has the form `…/auth/v1/verify?token=<hash>&type=<type>&redirect_to=…`.
 * Opening it would spend it in Safari, whose storage is separate from the
 * home-screen app; copying it and pasting it here lets the app exchange the
 * hash for a session itself. Mail apps sometimes wrap links in their own
 * redirect, so the text is decoded a few times before looking for the token.
 */
export function parseEmailLink(text: string): EmailLink | null {
  let s = text.trim();
  if (!/token(%3D|=)/i.test(s)) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break;
    }
  }
  const token = /[?&]token=([^&\s#"'<>]+)/i.exec(s)?.[1];
  if (!token || token.length < 16) return null;
  const rawType = /[?&]type=([a-z_]+)/i.exec(s)?.[1]?.toLowerCase();
  const type = TYPES.find((t) => t === rawType) ?? "email";
  return { tokenHash: token, type };
}
