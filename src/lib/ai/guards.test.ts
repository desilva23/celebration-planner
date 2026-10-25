import { describe, expect, it } from "vitest";
import type { QuoteSummary } from "./contracts";
import { verifyQuoteFigures } from "./guards";
import { numbersMentioned, parseAmount } from "./numbers";

const summary = (overrides: Partial<QuoteSummary>): QuoteSummary => ({
  label: "A",
  total: null,
  perGuest: null,
  guestsCovered: null,
  inclusions: [],
  extraCharges: [],
  terms: [],
  needsClarification: [],
  ...overrides,
});

describe("numbersMentioned", () => {
  it("understands Indian grouping and lakh/k shorthand", () => {
    const found = numbersMentioned("₹1,250 per plate, minimum 2,50,000 or 2.5 lakh for 200 pax, decor 80k");
    for (const n of [1250, 250_000, 200, 80_000]) expect(found.has(n)).toBe(true);
  });

  it("parses amounts with units", () => {
    expect(parseAmount("1.2", "crore")).toBe(12_000_000);
    expect(parseAmount("80", "k")).toBe(80_000);
  });
});

describe("verifyQuoteFigures", () => {
  const text = "Veg menu at Rs 1,250 per plate for up to 200 guests. GST extra.";

  it("keeps figures the quote actually states", () => {
    const checked = verifyQuoteFigures(summary({ perGuest: 1250, guestsCovered: 200 }), text);
    expect(checked).toMatchObject({ perGuest: 1250, guestsCovered: 200, needsClarification: [] });
  });

  it("drops a figure the model made up and says so", () => {
    const checked = verifyQuoteFigures(summary({ perGuest: 1250, total: 250_000 }), text);
    expect(checked.total).toBeNull();
    expect(checked.needsClarification[0]).toMatch(/isn't stated in the quote/);
  });

  it("checks every figure, puts its own notes first and keeps at most six", () => {
    const checked = verifyQuoteFigures(
      summary({ total: 1, perGuest: 2, guestsCovered: 350, needsClarification: ["a", "b", "c", "d", "e"] }),
      text,
    );
    expect(checked).toMatchObject({ total: null, perGuest: null, guestsCovered: null });
    expect(checked.needsClarification).toEqual([
      "Coverage for 350 guests isn't stated in the quote, so it was left out. Confirm with the vendor.",
      "A per-guest price of ₹2 isn't stated in the quote, so it was left out. Confirm with the vendor.",
      "A total of ₹1 isn't stated in the quote, so it was left out. Confirm with the vendor.",
      "a",
      "b",
      "c",
    ]);
  });
});
