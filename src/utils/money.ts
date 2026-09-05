export interface CurrencyInfo {
  code: string;
  name: string;
  locale: string;
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "COP", name: "Peso colombiano", locale: "es-CO", decimals: 0 },
  { code: "MXN", name: "Peso mexicano", locale: "es-MX", decimals: 2 },
  { code: "ARS", name: "Peso argentino", locale: "es-AR", decimals: 0 },
  { code: "CLP", name: "Peso chileno", locale: "es-CL", decimals: 0 },
  { code: "PEN", name: "Sol peruano", locale: "es-PE", decimals: 2 },
  { code: "USD", name: "Dólar", locale: "es-US", decimals: 2 },
  { code: "EUR", name: "Euro", locale: "es-ES", decimals: 2 },
  { code: "UYU", name: "Peso uruguayo", locale: "es-UY", decimals: 0 },
  { code: "BOB", name: "Boliviano", locale: "es-BO", decimals: 2 },
  { code: "GTQ", name: "Quetzal", locale: "es-GT", decimals: 2 },
  { code: "DOP", name: "Peso dominicano", locale: "es-DO", decimals: 0 },
  { code: "CRC", name: "Colón", locale: "es-CR", decimals: 0 },
  { code: "BRL", name: "Real", locale: "pt-BR", decimals: 2 },
];

export const DEFAULT_CURRENCY = "COP";

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function formatMoney(amount: number, code: string = DEFAULT_CURRENCY): string {
  const info = currencyInfo(code);
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const decimals = info.decimals === 0 ? 0 : hasCents ? 2 : 0;
  try {
    return new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${info.code} ${amount.toFixed(decimals)}`;
  }
}

/** Compact form for chips: "$15.000" stays, "$1,2 M" for millions. */
export function formatCompact(amount: number, code: string = DEFAULT_CURRENCY): string {
  if (amount >= 1_000_000) {
    const info = currencyInfo(code);
    const n = new Intl.NumberFormat(info.locale, { maximumFractionDigits: 1 }).format(amount / 1_000_000);
    return `${n} M`;
  }
  return formatMoney(amount, code);
}
