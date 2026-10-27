import { describe, expect, it } from "vitest";
import { numbersMentioned, parseAmount, parseCount } from "./numbers";

describe("parseAmount", () => {
  it.each([
    ["2,50,000", undefined, 250_000],
    ["2.5", "lakh", 250_000],
    ["3", "lakhs", 300_000],
    ["4", "lacs", 400_000],
    ["1.2", "crore", 12_000_000],
    ["2", "Crores", 20_000_000],
    ["5", "cr", 50_000_000],
    ["80", "K", 80_000],
    ["7", "L", 700_000],
  ])("reads %s %s as %i", (digits, unit, expected) => {
    expect(parseAmount(digits, unit)).toBe(expected);
  });

  it("treats an unrecognised unit as plain rupees", () => {
    expect(parseAmount("500", "rupees")).toBe(500);
  });

  it("gives up on digits that aren't a number", () => {
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("9".repeat(400))).toBeNull();
  });
});

describe("parseCount", () => {
  it("reads number words and digits", () => {
    expect(parseCount("Twelve")).toBe(12);
    expect(parseCount("a")).toBe(1);
    expect(parseCount("1,200")).toBe(1200);
  });

  it("gives up on words it doesn't know", () => {
    expect(parseCount("several")).toBeNull();
  });
});

describe("numbersMentioned", () => {
  it("records each figure as written, rounded, floored and with its unit expanded", () => {
    expect([...numbersMentioned("about 2.5 lakh")].sort((a, b) => a - b)).toEqual([2, 3, 250_000]);
  });

  it("reads grouped digits before a unit too", () => {
    expect([...numbersMentioned("about 1,500k")].sort((a, b) => a - b)).toEqual([1_500, 1_500_000]);
  });

  it("finds nothing in text without figures, or with digits too long to be a price", () => {
    expect(numbersMentioned("call us for a price").size).toBe(0);
    expect(numbersMentioned("9".repeat(400)).size).toBe(0);
  });
});
