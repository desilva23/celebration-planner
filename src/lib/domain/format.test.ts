import { describe, expect, it } from "vitest";
import { formatDate, formatInr } from "./format";

describe("formatInr", () => {
  it("groups digits the Indian way and drops paise", () => {
    expect(formatInr(800_000)).toBe("₹8,00,000");
    expect(formatInr(12_345_678.6)).toBe("₹1,23,45,679");
  });

  it("never renders negative zero", () => {
    expect(formatInr(-0)).toBe("₹0");
  });
});

describe("formatDate", () => {
  it("shows the calendar date as written, whatever the host time zone", () => {
    expect(formatDate("2027-02-15")).toBe("15 Feb 2027");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });
});
