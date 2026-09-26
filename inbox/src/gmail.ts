import type { IncomingEmail } from "./email";

/** The parts of a Gmail API message resource (users.messages.get, format "full") the mailbox reads. */
export interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPart[];
}

/**
 * The email inside a Gmail API message: sender, subject and its first plain
 * and HTML bodies, however deep they sit in multipart alternatives.
 * `decode` turns Gmail's URL-safe base64 into text (each platform has its own).
 */
export function emailFromGmail(message: { payload?: GmailPart }, decode: (data: string) => string): IncomingEmail {
  const payload = message.payload ?? {};
  const header = (name: string) => payload.headers?.find((h) => h.name.toLowerCase() === name)?.value;
  const email: IncomingEmail = { from: header("from"), subject: header("subject") };
  const walk = (part: GmailPart) => {
    const data = part.body?.data;
    if (data && part.mimeType === "text/plain" && email.text === undefined) email.text = decode(data);
    if (data && part.mimeType === "text/html" && email.html === undefined) email.html = decode(data);
    part.parts?.forEach(walk);
  };
  walk(payload);
  return email;
}
