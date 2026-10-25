// When a plan goes over budget there is no single right fix. These options
// lay out the concrete consequences of each route so the user can choose what
// matters to them, instead of the planner cutting everything evenly.

import { CATEGORY_META } from "./assumptions";
import { plannedTotal, scaleForGuests } from "./budget";
import { formatInr } from "./format";
import type { BudgetLine, CategoryId, Plan } from "./schema";

const CUT_STEP = 100;

export type TradeoffId = "use-contingency" | "protect-priorities" | "trim-guests" | "raise-budget";

export interface TradeoffOption {
  id: TradeoffId;
  title: string;
  /** Concrete consequences, one per entry. */
  impacts: string[];
  feasible: boolean;
  result: { budget: BudgetLine[]; guestCount: number; totalBudget: number };
}

export function overBudgetBy(plan: Plan): number {
  return plannedTotal(plan.budget) - plan.brief.totalBudget;
}

export function tradeoffOptions(plan: Plan): TradeoffOption[] {
  const gap = overBudgetBy(plan);
  if (gap <= 0) return [];
  return [absorbInContingency(plan, gap), protectPriorities(plan, gap), trimGuests(plan, gap), raiseBudget(plan, gap)];
}

function label(category: CategoryId): string {
  return CATEGORY_META[category].label;
}

function unchanged(plan: Plan, budget: BudgetLine[]): TradeoffOption["result"] {
  return { budget, guestCount: plan.brief.guestCount, totalBudget: plan.brief.totalBudget };
}

function absorbInContingency(plan: Plan, gap: number): TradeoffOption {
  const buffer = plan.budget.find((line) => line.category === "contingency" && line.source === "estimate");
  const available = buffer?.amount ?? 0;
  const take = Math.min(available, gap);
  const budget = plan.budget.map((line) => (line === buffer ? { ...line, amount: line.amount - take } : line));
  const feasible = available >= gap;
  return {
    id: "use-contingency",
    title: "Absorb it in the contingency buffer",
    impacts: feasible
      ? [
          `Contingency drops from ${formatInr(available)} to ${formatInr(available - take)}`,
          "Less cushion for surprises close to the day",
        ]
      : [`Contingency only holds ${formatInr(available)}, ${formatInr(gap - available)} short of the gap`],
    feasible,
    result: unchanged(plan, budget),
  };
}

export interface CutResult {
  budget: BudgetLine[];
  cuts: { category: CategoryId; from: number; to: number }[];
  /** How much of the gap could not be covered without breaking a line's floor. */
  shortfall: number;
}

/**
 * Cuts estimate lines outside `protectedCategories`, each in proportion to how
 * much it can give before reaching its floor. Cuts are made in whole ₹100
 * steps so the resulting plan reads as round planning figures.
 */
export function cutFlexibleLines(
  lines: BudgetLine[],
  gap: number,
  protectedCategories: ReadonlySet<CategoryId>,
): CutResult {
  // Work in units of CUT_STEP rupees throughout.
  const room = new Map<CategoryId, number>();
  for (const line of lines) {
    if (line.source !== "estimate" || protectedCategories.has(line.category)) continue;
    const floor = Math.ceil(line.amount * CATEGORY_META[line.category].floor);
    room.set(line.category, Math.floor((line.amount - floor) / CUT_STEP));
  }
  const totalRoom = [...room.values()].reduce((a, b) => a + b, 0);
  const needed = Math.ceil(gap / CUT_STEP);
  const target = Math.min(needed, totalRoom);

  const cut = new Map<CategoryId, number>();
  let assigned = 0;
  for (const [category, r] of room) {
    const share = totalRoom === 0 ? 0 : Math.floor((target * r) / totalRoom);
    cut.set(category, share);
    assigned += share;
  }
  // Flooring leaves a few steps unassigned; give them to the roomiest lines.
  let leftover = target - assigned;
  for (const [category, r] of [...room].sort((a, b) => b[1] - a[1])) {
    if (leftover === 0) break;
    const extra = Math.min(leftover, r - (cut.get(category) ?? 0));
    cut.set(category, (cut.get(category) ?? 0) + extra);
    leftover -= extra;
  }

  const cuts: CutResult["cuts"] = [];
  const budget = lines.map((line) => {
    const amount = (cut.get(line.category) ?? 0) * CUT_STEP;
    if (amount === 0) return line;
    cuts.push({ category: line.category, from: line.amount, to: line.amount - amount });
    return { ...line, amount: line.amount - amount };
  });
  return { budget, cuts, shortfall: Math.max(0, gap - target * CUT_STEP) };
}

function protectPriorities(plan: Plan, gap: number): TradeoffOption {
  const priorities = plan.brief.priorities;
  const { budget, cuts, shortfall } = cutFlexibleLines(plan.budget, gap, new Set(priorities));
  const title = priorities.length
    ? `Keep ${priorities.map(label).join(", ")} as planned and trim the rest`
    : "Trim every flexible line in proportion";
  const impacts = cuts.map((c) => `${label(c.category)}: ${formatInr(c.from)} → ${formatInr(c.to)}`);
  if (shortfall > 0) {
    impacts.push(`Still ${formatInr(shortfall)} over after trimming every flexible line to its minimum`);
  }
  return { id: "protect-priorities", title, impacts, feasible: shortfall === 0, result: unchanged(plan, budget) };
}

function trimGuests(plan: Plan, gap: number): TradeoffOption {
  const { guestCount, totalBudget } = plan.brief;
  const perGuest =
    plannedTotal(plan.budget.filter((line) => line.scalesWithGuests && line.source === "estimate")) / guestCount;

  if (perGuest === 0) {
    return {
      id: "trim-guests",
      title: "Invite fewer guests",
      impacts: ["No headcount-based estimates left to reduce (they are already confirmed)"],
      feasible: false,
      result: unchanged(plan, plan.budget),
    };
  }

  // Per-line rounding can leave the scaled plan a rupee or two over, so step
  // down until it actually fits.
  let fewer = Math.ceil(gap / perGuest);
  let budget = scaleForGuests(plan.budget, guestCount, guestCount - fewer);
  while (guestCount - fewer >= 1 && plannedTotal(budget) > totalBudget) {
    fewer += 1;
    budget = scaleForGuests(plan.budget, guestCount, guestCount - fewer);
  }
  const newCount = guestCount - fewer;
  const feasible = newCount >= 1;
  return {
    id: "trim-guests",
    title: "Invite fewer guests",
    impacts: feasible
      ? [
          `Invite ${newCount} instead of ${guestCount} (${fewer} fewer)`,
          `Headcount-based costs fall by about ${formatInr(Math.round(perGuest * fewer))}`,
        ]
      : ["The gap is larger than the whole headcount-based spend"],
    feasible,
    result: { budget: feasible ? budget : plan.budget, guestCount: feasible ? newCount : guestCount, totalBudget },
  };
}

function raiseBudget(plan: Plan, gap: number): TradeoffOption {
  const planned = plannedTotal(plan.budget);
  return {
    id: "raise-budget",
    title: "Keep the plan and raise the budget",
    impacts: [`Budget goes from ${formatInr(plan.brief.totalBudget)} to ${formatInr(planned)} (+${formatInr(gap)})`],
    feasible: true,
    result: { budget: plan.budget, guestCount: plan.brief.guestCount, totalBudget: planned },
  };
}
