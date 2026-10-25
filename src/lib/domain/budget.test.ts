import { describe, expect, it } from "vitest";
import { allocateBudget, plannedTotal, scaleForGuests, summariseBudget } from "./budget";
import { weddingBrief } from "./fixtures.test-helpers";

describe("allocateBudget", () => {
  it.each([800_000, 777_777, 25_050])("adds up to the budget exactly (₹%i)", (totalBudget) => {
    const lines = allocateBudget({ eventType: "wedding", totalBudget });
    expect(plannedTotal(lines)).toBe(totalBudget);
  });

  it("marks every first-draft line as an estimate", () => {
    const lines = allocateBudget(weddingBrief());
    expect(lines.every((l) => l.source === "estimate")).toBe(true);
  });

  it("only includes categories that apply to the event type", () => {
    const lines = allocateBudget({ eventType: "community", totalBudget: 100_000 });
    expect(lines.map((l) => l.category)).not.toContain("attire");
  });
});

describe("scaleForGuests", () => {
  const lines = allocateBudget(weddingBrief());
  const amount = (ls: typeof lines, c: string) => ls.find((l) => l.category === c)!.amount;

  it("scales headcount-driven estimates and leaves fixed costs alone", () => {
    const scaled = scaleForGuests(lines, 200, 250);
    expect(amount(scaled, "catering")).toBe(Math.round(amount(lines, "catering") * 1.25));
    expect(amount(scaled, "venue")).toBe(amount(lines, "venue"));
  });

  it("never rescales a confirmed price", () => {
    const confirmed = lines.map((l) => (l.category === "catering" ? { ...l, source: "confirmed" as const } : l));
    expect(amount(scaleForGuests(confirmed, 200, 250), "catering")).toBe(amount(lines, "catering"));
  });
});

describe("summariseBudget", () => {
  it("reports how far over budget the plan is", () => {
    const lines = scaleForGuests(allocateBudget(weddingBrief()), 200, 250);
    const summary = summariseBudget(lines, weddingBrief());
    expect(summary.overBy).toBe(summary.planned - 800_000);
    expect(summary.overBy).toBeGreaterThan(0);
  });

  it("flags catering that is thin for the guest count", () => {
    const brief = weddingBrief({ guestCount: 1000, totalBudget: 200_000 });
    expect(summariseBudget(allocateBudget(brief), brief).cateringLooksThin).toBe(true);
    expect(summariseBudget(allocateBudget(weddingBrief()), weddingBrief()).cateringLooksThin).toBe(false);
  });
});
