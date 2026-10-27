import { describe, expect, it } from "vitest";
import { CATEGORY_META } from "./assumptions";
import { plannedTotal } from "./budget";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { applyChange, applyTradeoff, bookVendor, createPlan, PlanError, setBudgetAmount, upsertVendor } from "./plan";
import { CATEGORIES, type CategoryId, type Plan } from "./schema";
import { cutFlexibleLines, overBudgetBy, tradeoffOptions } from "./tradeoffs";

const fitting = createPlan(weddingBrief(), TODAY);
const overBudget = applyChange(fitting, { guestCount: 250 }, TODAY).plan;
const option = (id: string) => tradeoffOptions(overBudget).find((o) => o.id === id)!;

const optionsFor = (plan: Plan) => new Map(tradeoffOptions(plan).map((o) => [o.id, o]));
const amountOf = (plan: Plan, category: CategoryId) => plan.budget.find((l) => l.category === category)!.amount;

/** Books a vendor for `category` at `quote`, making that line a confirmed price. */
function booked(plan: Plan, category: CategoryId, quote: number): Plan {
  const id = `v-${category}`;
  const withVendor = upsertVendor(plan, {
    id,
    category,
    name: "Vendor",
    contact: "",
    quote,
    status: "quoted",
    notes: "",
    payments: [],
  });
  return bookVendor(withVendor, id).plan;
}

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

  it("absorbs a small gap in contingency and says what that costs", () => {
    const plan = setBudgetAmount(fitting, "venue", amountOf(fitting, "venue") + 10_000);
    const o = optionsFor(plan).get("use-contingency")!;
    expect(o.feasible).toBe(true);
    expect(o.impacts).toEqual([
      "Contingency drops from ₹40,000 to ₹30,000",
      "Less cushion for surprises close to the day",
    ]);
    expect(plannedTotal(o.result.budget)).toBe(plan.brief.totalBudget);
  });

  it("trims every flexible line evenly when nothing is protected", () => {
    const plan = setBudgetAmount(createPlan(weddingBrief({ priorities: [] }), TODAY), "venue", 186_000);
    expect(optionsFor(plan).get("protect-priorities")!.title).toBe("Trim every flexible line in proportion");
  });

  describe("when a confirmed price blows far past the budget", () => {
    const plan = booked(fitting, "venue", 5_000_000);
    const options = optionsFor(plan);

    it("says how much is still over after cutting everything it can", () => {
      const o = options.get("protect-priorities")!;
      expect(o.feasible).toBe(false);
      expect(o.impacts.at(-1)).toMatch(/^Still ₹[\d,]+ over after trimming every flexible line to its minimum$/);
    });

    it("won't trim more guests than there are", () => {
      expect(options.get("trim-guests")).toMatchObject({
        feasible: false,
        impacts: ["The gap is larger than the whole headcount-based spend"],
        result: { guestCount: 200, budget: plan.budget },
      });
    });

    it("can still raise the budget", () => {
      expect(options.get("raise-budget")!.feasible).toBe(true);
    });
  });

  it("trims one guest more when per-line rounding leaves the plan a rupee over", () => {
    // 1 guest fewer would save ₹1,415 on paper, but both lines round half up and save only ₹1,414.
    const base = createPlan(weddingBrief({ guestCount: 12, totalBudget: 115_565 }), TODAY);
    const plan: Plan = {
      ...base,
      budget: [
        { category: "catering", amount: 10_998, scalesWithGuests: true, source: "estimate" },
        { category: "invitations", amount: 5_982, scalesWithGuests: true, source: "estimate" },
        { category: "venue", amount: 100_000, scalesWithGuests: false, source: "estimate" },
      ],
    };
    const o = optionsFor(plan).get("trim-guests")!;
    expect(o.impacts[0]).toBe("Invite 10 instead of 12 (2 fewer)");
    expect(plannedTotal(o.result.budget)).toBeLessThanOrEqual(plan.brief.totalBudget);
  });

  it("can't trim guests once every per-guest price is confirmed", () => {
    const plan = booked(booked(fitting, "catering", 400_000), "invitations", 24_000);
    expect(optionsFor(plan).get("trim-guests")).toMatchObject({
      feasible: false,
      impacts: ["No headcount-based estimates left to reduce (they are already confirmed)"],
    });
  });

  it("won't raise the budget past the largest one a plan can hold", () => {
    const plan = booked(createPlan(weddingBrief({ totalBudget: 95_000_000 }), TODAY), "venue", 30_000_000);
    const o = optionsFor(plan).get("raise-budget")!;
    expect(o.feasible).toBe(false);
    expect(o.impacts[0]).toMatch(/more than the largest budget the planner handles \(₹10,00,00,000\)/);
    expect(o.result.totalBudget).toBe(95_000_000);
    expect(() => applyTradeoff(plan, o)).toThrow(PlanError);
  });

  it("leaves the plan in budget whichever feasible option is chosen", () => {
    for (const plan of [overBudget, booked(fitting, "venue", 300_000)]) {
      for (const o of tradeoffOptions(plan).filter((t) => t.feasible)) {
        expect(overBudgetBy(applyTradeoff(plan, o)), o.id).toBeLessThanOrEqual(0);
      }
    }
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

  it("cuts nothing when every line is protected", () => {
    expect(cutFlexibleLines(fitting.budget, 5_000, new Set(CATEGORIES))).toEqual({
      budget: fitting.budget,
      cuts: [],
      shortfall: 5_000,
    });
  });

  it("cuts nothing when no line has a whole ₹100 to give", () => {
    const tiny = [{ category: "decor" as const, amount: 100, scalesWithGuests: false, source: "estimate" as const }];
    expect(cutFlexibleLines(tiny, 500, new Set())).toMatchObject({ cuts: [], shortfall: 500 });
  });
});
