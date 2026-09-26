interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
  name?: string;
}

/** Turns an auth error into a sentence the person can act on. */
export function describeAuthError(err: unknown): string {
  const e = (typeof err === "object" && err ? err : { message: String(err) }) as ErrorLike;
  const code = (e.code ?? "").toLowerCase();
  const message = (e.message ?? "").toLowerCase();

  if (e.status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return "Pediste varios códigos seguidos. Espera un momento y vuelve a intentar.";
  }
  if (code === "otp_expired" || code === "otp_disabled" || message.includes("expired") || (message.includes("invalid") && message.includes("token"))) {
    return "Ese código o enlace no sirve o ya venció. Pide uno nuevo.";
  }
  if (code === "email_address_invalid" || message.includes("invalid email") || message.includes("unable to validate email")) {
    return "Ese correo no parece válido. Revísalo.";
  }
  // The database refuses to create accounts for emails that are not on the allowed list.
  if (message.includes("database error saving new user") || message.includes("no tiene acceso")) {
    return "Este correo no tiene acceso a Contame.";
  }
  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "Este correo no tiene cuenta y no se pueden crear cuentas nuevas.";
  }
  if (e.name === "TypeError" || message.includes("failed to fetch") || message.includes("network")) {
    return "No pude conectarme. Revisa tu señal y vuelve a intentar.";
  }
  return e.message ? `Algo falló: ${e.message}` : "Algo falló. Vuelve a intentar.";
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
