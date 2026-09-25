import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "./client";
import { cloudConfig } from "./config";
import { describeAuthError } from "./errors";

export type AccountState =
  /** The build has no Supabase settings: the app is local only. */
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string; userId: string };

/** The outcome of an auth action: nothing on success, a readable sentence on failure. */
export type ActionResult = { error: string | null };

function fromSession(session: Session | null): AccountState {
  if (!session?.user) return { status: "signedOut" };
  return { status: "signedIn", email: session.user.email ?? "", userId: session.user.id };
}

export function useAccount() {
  const [state, setState] = useState<AccountState>(cloudConfig ? { status: "loading" } : { status: "unavailable" });

  useEffect(() => {
    if (!cloudConfig) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    getClient(cloudConfig)
      .then(async (sb) => {
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        setState(fromSession(data.session));
        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => setState(fromSession(session)));
        unsubscribe = () => sub.subscription.unsubscribe();
      })
      .catch(() => alive && setState({ status: "signedOut" }));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const run = useCallback(async (fn: (sb: Awaited<ReturnType<typeof getClient>>) => Promise<{ error: unknown }>): Promise<ActionResult> => {
    if (!cloudConfig) return { error: "Esta versión de la app no tiene cuentas configuradas." };
    try {
      const { error } = await fn(await getClient(cloudConfig));
      return { error: error ? describeAuthError(error) : null };
    } catch (err) {
      return { error: describeAuthError(err) };
    }
  }, []);

  /** Emails a one-time code. Creates the account the first time. */
  const sendCode = useCallback(
    (email: string) => run((sb) => sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })),
    [run],
  );

  const verifyCode = useCallback(
    (email: string, code: string) => run((sb) => sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })),
    [run],
  );

  const signOut = useCallback(() => run((sb) => sb.auth.signOut()), [run]);

  return { state, sendCode, verifyCode, signOut };
}

export type AccountApi = ReturnType<typeof useAccount>;
