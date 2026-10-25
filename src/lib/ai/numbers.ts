const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  l: 100_000,
  lac: 100_000,
  lakh: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

export const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|k|l)?\b`;

/** "2.5", "lakh" → 250000. Handles Indian digit grouping ("2,50,000"). */
export function parseAmount(digits: string, unit?: string): number | null {
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const multiplier = unit ? (UNIT_MULTIPLIER[unit.toLowerCase().replace(/s$/, "")] ?? 1) : 1;
  return Math.round(value * multiplier);
}

/** "two" → 2, "15" → 15. */
export function parseCount(raw: string): number | null {
  const word = WORD_NUMBERS[raw.toLowerCase()];
  if (word !== undefined) return word;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Every figure written in `text`, including expanded lakh/crore/k amounts. */
export function numbersMentioned(text: string): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(new RegExp(AMOUNT, "gi"))) {
    // Null only when the digits overflow, in which case there is nothing to record.
    const expanded = parseAmount(match[1], match[2]);
    if (expanded === null) continue;
    const raw = Number(match[1].replace(/,/g, ""));
    found.add(Math.round(raw));
    found.add(Math.floor(raw));
    found.add(expanded);
  }
  return found;
}
