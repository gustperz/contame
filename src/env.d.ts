interface ImportMetaEnv {
  /** Supabase project URL. When missing, everything account-related stays hidden. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key. Public by design: row level security protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
