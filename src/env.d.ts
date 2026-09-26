interface ImportMetaEnv {
  /** Supabase project URL. When missing, everything account-related stays hidden. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key. Public by design: row level security protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

declare module "virtual:mailbox-code" {
  /** The Apps Script mailbox, in pieces (see inbox/build/mailbox.ts). */
  const parts: import("../inbox/apps-script/assemble").MailboxParts;
  export default parts;
}
