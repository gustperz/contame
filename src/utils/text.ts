/** Lowercase and strip accents so keyword matching is forgiving. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Like normalize() but character-aligned with the input: the result has the
 * same length, so offsets found in it can be applied to the original text.
 * Collapse whitespace on the input first if you need single spaces.
 */
export function normalizeAligned(text: string): string {
  let out = "";
  for (const ch of text) {
    const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const lower = (stripped.length === 1 ? stripped : ch).toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}
