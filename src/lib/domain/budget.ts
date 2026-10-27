import { BUDGET_WEIGHTS, CATEGORY_META, CATERING_PER_GUEST } from "./assumptions";
import type { BudgetLine, CategoryId, EventBrief } from "./schema";

const ROUND_TO = 100;

export function plannedTotal(lines: BudgetLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

/** First-draft split of the budget across categories for this kind of event. */
export function allocateBudget(brief: Pick<EventBrief, "eventType" | "totalBudget">): BudgetLine[] {
  const weights = Object.entries(BUDGET_WEIGHTS[brief.eventType]) as [CategoryId, number][];
  const lines: BudgetLine[] = weights.map(([category, weight]) => ({
    category,
    amount: Math.floor((brief.totalBudget * weight) / ROUND_TO) * ROUND_TO,
    scalesWithGuests: CATEGORY_META[category].scalesWithGuests,
    source: "estimate",
  }));

  // Rounding down leaves a little spare; park it in contingency so the draft
  // adds up to the budget exactly.
  const remainder = brief.totalBudget - plannedTotal(lines);
  return lines.map((line) => (line.category === "contingency" ? { ...line, amount: line.amount + remainder } : line));
}

/**
 * Rescales headcount-driven estimates. Confirmed prices are left alone: they
 * were agreed for the old headcount and need a fresh quote, not a guess.
 */
export function scaleForGuests(lines: BudgetLine[], fromGuests: number, toGuests: number): BudgetLine[] {
  if (fromGuests === toGuests) return lines;
  const ratio = toGuests / fromGuests;
  return lines.map((line) => scaleLine(line, ratio));
}

/** One line at `ratio` times the headcount: per-guest estimates scale, anything else stays as it is. */
export function scaleLine(line: BudgetLine, ratio: number): BudgetLine {
  return line.scalesWithGuests && line.source === "estimate"
    ? { ...line, amount: Math.round(line.amount * ratio) }
    : line;
}

export function setLineAmount(lines: BudgetLine[], category: CategoryId, amount: number): BudgetLine[] {
  return lines.map((line) => (line.category === category ? { ...line, amount } : line));
}

export interface BudgetSummary {
  planned: number;
  budget: number;
  /** Positive when the plan costs more than the budget. */
  overBy: number;
  confirmed: number;
  cateringPerGuest: number | null;
  cateringAssumption: number;
  cateringLooksThin: boolean;
}

export function summariseBudget(
  lines: BudgetLine[],
  brief: Pick<EventBrief, "totalBudget" | "guestCount" | "tier">,
): BudgetSummary {
  const planned = plannedTotal(lines);
  const catering = lines.find((line) => line.category === "catering");
  const cateringPerGuest = catering ? Math.round(catering.amount / brief.guestCount) : null;
  const cateringAssumption = CATERING_PER_GUEST[brief.tier];
  return {
    planned,
    budget: brief.totalBudget,
    overBy: planned - brief.totalBudget,
    confirmed: plannedTotal(lines.filter((line) => line.source === "confirmed")),
    cateringPerGuest,
    cateringAssumption,
    cateringLooksThin: cateringPerGuest !== null && cateringPerGuest < cateringAssumption * 0.75,
  };
}
