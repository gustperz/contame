import { CATEGORIES } from "../categories";
import type { CategoryId } from "../types";
import { normalize } from "../../utils/text";

export interface CategoryMatch {
  category: CategoryId;
  /** Offsets of an explicit "#tag" so it can be removed from the description. */
  tag?: { start: number; end: number };
}

const NAME_TO_ID: Record<string, CategoryId> = Object.fromEntries(
  CATEGORIES.flatMap((c) => [
    [normalize(c.name), c.id],
    [c.id, c.id],
  ]),
) as Record<string, CategoryId>;

/** Infers the category from keywords; an explicit "#comida" hashtag always wins. */
export function findCategory(text: string): CategoryMatch {
  const tag = text.match(/#([\p{L}]+)/u);
  if (tag && tag.index !== undefined) {
    const id = NAME_TO_ID[normalize(tag[1])];
    if (id) return { category: id, tag: { start: tag.index, end: tag.index + tag[0].length } };
  }
  const padded = ` ${text} `;
  let best: { id: CategoryId; score: number } | null = null;
  for (const c of CATEGORIES) {
    let score = 0;
    for (const kw of c.keywords) {
      // Whole-word match; multi-word keywords are matched as phrases.
      const idx = padded.indexOf(` ${kw} `);
      if (idx !== -1) score += kw.includes(" ") ? 3 : kw.length >= 5 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return { category: best?.id ?? "otros" };
}
