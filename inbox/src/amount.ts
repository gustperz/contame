/**
 * Reads an amount as a Colombian bank writes it. Lulo and Banco de Bogotá use
 * the comma as the thousands separator ("90,940", "25,500.00"), the opposite of
 * the usual Colombian notation, so both forms have to be accepted.
 */
export function parseAmount(text: string): number {
  const clean = text.replace(/[\s$]/g, "");
  if (!/^\d[\d.,]*$/.test(clean)) return NaN;
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");

  // With both separators present, the last one marks the decimals.
  if (comma !== -1 && dot !== -1) {
    return dot > comma
      ? Number(clean.replace(/,/g, ""))
      : Number(clean.replace(/\./g, "").replace(",", "."));
  }

  const separator = comma !== -1 ? comma : dot;
  if (separator === -1) return Number(clean);

  // Three digits after a lone separator means thousands, not decimals.
  const trailing = clean.length - separator - 1;
  if (trailing === 3) return Number(clean.replace(/[.,]/g, ""));
  return Number(clean.replace(",", "."));
}
