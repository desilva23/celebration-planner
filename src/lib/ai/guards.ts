import { formatInr } from "../domain/format";
import type { QuoteSummary } from "./contracts";
import { numbersMentioned } from "./numbers";

/**
 * Drops any figure the model reported that isn't written in the quote itself.
 * A price the user can't trace back to the vendor's own words is worse than
 * no price, because it looks confirmed.
 */
export function verifyQuoteFigures(summary: QuoteSummary, sourceText: string): QuoteSummary {
  const mentioned = numbersMentioned(sourceText);
  const notes = [...summary.needsClarification];

  const keep = (value: number | null, describe: (v: number) => string): number | null => {
    if (value === null || mentioned.has(value)) return value;
    notes.unshift(`${describe(value)} isn't stated in the quote, so it was left out. Confirm with the vendor.`);
    return null;
  };

  return {
    ...summary,
    total: keep(summary.total, (v) => `A total of ${formatInr(v)}`),
    perGuest: keep(summary.perGuest, (v) => `A per-guest price of ${formatInr(v)}`),
    guestsCovered: keep(summary.guestsCovered, (v) => `Coverage for ${v} guests`),
    needsClarification: notes.slice(0, 6),
  };
}
