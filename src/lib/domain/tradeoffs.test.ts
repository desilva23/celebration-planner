import { describe, expect, it } from "vitest";
import { CATEGORY_META } from "./assumptions";
import { plannedTotal } from "./budget";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { applyChange, applyTradeoff, createPlan, PlanError } from "./plan";
import { cutFlexibleLines, overBudgetBy, tradeoffOptions } from "./tradeoffs";

const fitting = createPlan(weddingBrief(), TODAY);
const overBudget = applyChange(fitting, { guestCount: 250 }, TODAY).plan;
const option = (id: string) => tradeoffOptions(overBudget).find((o) => o.id === id)!;

describe("tradeoffOptions", () => {
  it("offers nothing when the plan fits", () => {
    expect(tradeoffOptions(fitting)).toEqual([]);
  });

  it("offers four distinct routes when over budget", () => {
    expect(overBudgetBy(overBudget)).toBeGreaterThan(0);
    expect(tradeoffOptions(overBudget).map((o) => o.id)).toEqual([
      "use-contingency",
      "protect-priorities",
      "trim-guests",
      "raise-budget",
    ]);
  });

  it("says when contingency alone can't cover the gap", () => {
    expect(option("use-contingency").feasible).toBe(false);
  });

  it("closes the gap without touching protected categories or breaking floors", () => {
    const o = option("protect-priorities");
    expect(o.feasible).toBe(true);
    const planned = plannedTotal(o.result.budget);
    expect(planned).toBeLessThanOrEqual(overBudget.brief.totalBudget);
    expect(overBudget.brief.totalBudget - planned).toBeLessThan(100);
    for (const line of o.result.budget) {
      const before = overBudget.budget.find((l) => l.category === line.category)!;
      if (overBudget.brief.priorities.includes(line.category)) expect(line.amount).toBe(before.amount);
      expect(line.amount).toBeGreaterThanOrEqual(Math.ceil(before.amount * CATEGORY_META[line.category].floor));
    }
  });

  it("finds a guest count that fits", () => {
    const o = option("trim-guests");
    expect(o.feasible).toBe(true);
    expect(o.result.guestCount).toBeLessThan(250);
    expect(plannedTotal(o.result.budget)).toBeLessThanOrEqual(o.result.totalBudget);
  });

  it("can raise the budget to match the plan", () => {
    const o = option("raise-budget");
    expect(o.result.totalBudget).toBe(plannedTotal(overBudget.budget));
  });

  it("applies a chosen option and leaves the plan in budget", () => {
    const next = applyTradeoff(overBudget, option("trim-guests"));
    expect(overBudgetBy(next)).toBeLessThanOrEqual(0);
  });

  it("refuses an option that doesn't close the gap", () => {
    expect(() => applyTradeoff(overBudget, option("use-contingency"))).toThrow(PlanError);
  });
});

describe("cutFlexibleLines", () => {
  it("cuts in round ₹100 steps", () => {
    const { cuts } = cutFlexibleLines(fitting.budget, 12_345, new Set());
    for (const c of cuts) expect((c.from - c.to) % 100).toBe(0);
  });

  it("reports a shortfall when the gap exceeds what can be cut", () => {
    const { shortfall } = cutFlexibleLines(fitting.budget, 10_000_000, new Set());
    expect(shortfall).toBeGreaterThan(0);
  });
});
