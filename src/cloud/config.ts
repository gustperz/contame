export interface CloudConfig {
  url: string;
  key: string;
}

/**
 * Reads the Supabase settings the build was given. Both values are public: the
 * key only identifies the project, and row level security is what keeps each
 * user's data private. Without them the app runs exactly as before, local only.
 */
export function readCloudConfig(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  if (!/^https?:\/\/[^/\s]+$/.test(url)) return null;
  return { url, key };
}

export const cloudConfig = readCloudConfig(import.meta.env);
