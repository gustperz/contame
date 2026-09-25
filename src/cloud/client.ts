import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudConfig } from "./config";

let client: Promise<SupabaseClient> | null = null;

/**
 * The Supabase client, loaded on first use so it never weighs on the first
 * paint of the app. The session lives in this app's own storage: in an iPhone
 * home-screen app that is separate from Safari's, which is why sign-in uses a
 * code typed here rather than a link that would open in Safari.
 */
export function getClient(config: CloudConfig): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "contame:auth" },
    }),
  );
  return client;
}
