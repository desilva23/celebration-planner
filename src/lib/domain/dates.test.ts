import { describe, expect, it } from "vitest";
import { addDays, daysBetween, earlierOf, laterOf, todayIso } from "./dates";

describe("addDays", () => {
  it.each([
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2027-03-01", -1, "2027-02-28"],
    ["2026-10-25", 0, "2026-10-25"],
  ])("%s %+i days is %s, across month, year and leap-day boundaries", (from, days, to) => {
    expect(addDays(from, days)).toBe(to);
  });
});

describe("daysBetween", () => {
  it("counts whole days, negative when the second date is earlier", () => {
    expect(daysBetween("2026-10-25", "2027-03-01")).toBe(127);
    expect(daysBetween("2027-03-01", "2026-10-25")).toBe(-127);
    expect(daysBetween("2026-10-25", "2026-10-25")).toBe(0);
  });

  it("is the inverse of addDays", () => {
    for (const days of [-400, -1, 0, 1, 59, 366])
      expect(daysBetween("2027-01-31", addDays("2027-01-31", days))).toBe(days);
  });
});

describe("todayIso", () => {
  it("uses the local calendar date, zero-padded", () => {
    expect(todayIso(new Date(2027, 0, 5, 23, 59))).toBe("2027-01-05");
    expect(todayIso(new Date(2027, 10, 30, 0, 1))).toBe("2027-11-30");
  });
});

describe("laterOf / earlierOf", () => {
  it("compare ISO dates in calendar order", () => {
    expect(laterOf("2027-01-01", "2026-12-31")).toBe("2027-01-01");
    expect(laterOf("2026-12-31", "2027-01-01")).toBe("2027-01-01");
    expect(earlierOf("2027-01-01", "2026-12-31")).toBe("2026-12-31");
    expect(earlierOf("2026-12-31", "2027-01-01")).toBe("2026-12-31");
  });
});
