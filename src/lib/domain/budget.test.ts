import { describe, expect, it } from "vitest";
import { allocateBudget, plannedTotal, scaleForGuests, setLineAmount, summariseBudget } from "./budget";
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

  it("returns the same lines when the headcount hasn't changed", () => {
    expect(scaleForGuests(lines, 200, 200)).toBe(lines);
  });
});

describe("setLineAmount", () => {
  it("changes only the named line", () => {
    const lines = allocateBudget(weddingBrief());
    const next = setLineAmount(lines, "decor", 50_000);
    expect(next.find((l) => l.category === "decor")!.amount).toBe(50_000);
    expect(next.filter((l) => l.category !== "decor")).toEqual(lines.filter((l) => l.category !== "decor"));
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

  it("totals confirmed prices separately from estimates", () => {
    const lines = allocateBudget(weddingBrief()).map((l) =>
      l.category === "venue" || l.category === "decor" ? { ...l, source: "confirmed" as const } : l,
    );
    expect(summariseBudget(lines, weddingBrief()).confirmed).toBe(176_000 + 96_000);
  });

  it("has no per-guest catering figure without a catering line", () => {
    const lines = allocateBudget(weddingBrief()).filter((l) => l.category !== "catering");
    expect(summariseBudget(lines, weddingBrief())).toMatchObject({ cateringPerGuest: null, cateringLooksThin: false });
  });
});
