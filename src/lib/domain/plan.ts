// Plan operations. Every function is pure: it takes a plan and returns a new
// one, plus a list of human-readable effects describing what moved and why.

import type { z } from "zod";
import { CATEGORY_META, CATERING_PER_GUEST } from "./assumptions";
import { allocateBudget, scaleForGuests, setLineAmount, summariseBudget } from "./budget";
import { daysBetween } from "./dates";
import { formatDate, formatInr } from "./format";
import {
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  PlanChangeSchema,
  PaymentSchema,
  PlanSchema,
  type CategoryId,
  type EventBrief,
  type Plan,
  type PlanChange,
  type Payment,
  type Task,
  type Vendor,
} from "./schema";
import { buildTimeline, delayTask, planningWindow, rescheduleOpenTasks, taskHealth } from "./timeline";
import type { TradeoffOption } from "./tradeoffs";

export interface ChangeEffect {
  tone: "info" | "warning";
  message: string;
}

export interface PlanUpdate {
  plan: Plan;
  effects: ChangeEffect[];
}

export class PlanError extends Error {}

/** Booking a vendor in one of these categories completes the matching task. */
const BOOKING_TASK: Partial<Record<CategoryId, string>> = {
  venue: "venue",
  catering: "caterer",
  photography: "photographer",
  decor: "decor",
  entertainment: "entertainment",
};

const label = (category: CategoryId) => CATEGORY_META[category].label;

/** Plain-language limits for the fields a user can push out of range. */
const LIMIT_MESSAGES: Partial<Record<string, string>> = {
  guestCount: `Guests have to be a whole number from 1 to ${MAX_GUESTS.toLocaleString("en-IN")}.`,
  totalBudget: `The budget has to be between ${formatInr(MIN_BUDGET)} and ${formatInr(MAX_BUDGET)}.`,
  eventDate: "That isn't a real calendar date.",
};

function rejected(error: z.ZodError): PlanError {
  const field = String(error.issues[0]?.path.at(-1));
  return new PlanError(LIMIT_MESSAGES[field] ?? "That change would leave the plan invalid, so it wasn't made.");
}

/**
 * Every operation returns its plan through here. A plan that fails the schema
 * would be silently dropped the next time it loads, so it is refused instead.
 */
function stamp(plan: Omit<Plan, "updatedAt">, now: Date): Plan {
  const next = { ...plan, updatedAt: now.toISOString() };
  const check = PlanSchema.safeParse(next);
  if (!check.success) throw rejected(check.error);
  return next;
}

export function createPlan(brief: EventBrief, today: string, now: Date = new Date()): Plan {
  if (brief.eventDate <= today) throw new PlanError("Pick an event date after today.");
  const budget = allocateBudget(brief);
  const tasks = buildTimeline({
    eventType: brief.eventType,
    eventDate: brief.eventDate,
    today,
    categories: new Set(budget.map((line) => line.category)),
  });
  return stamp({ version: 1, brief, budget, tasks, vendors: [], createdAt: now.toISOString() }, now);
}

/**
 * Applies a change to the brief and propagates it: headcount rescales the
 * per-guest lines, a new date reschedules open tasks, and anything that pushes
 * the plan over budget is flagged so the user can pick a trade-off.
 */
export function applyChange(plan: Plan, change: PlanChange, today: string, now: Date = new Date()): PlanUpdate {
  const checked = PlanChangeSchema.safeParse(change);
  if (!checked.success) throw rejected(checked.error);
  const before = plan.brief;
  const brief: EventBrief = { ...before, ...change };
  if (brief.eventDate <= today) throw new PlanError("The event date has to be after today.");

  const effects: ChangeEffect[] = [];
  let budget = plan.budget;
  let tasks = plan.tasks;

  if (brief.guestCount !== before.guestCount) {
    budget = scaleForGuests(budget, before.guestCount, brief.guestCount);
    effects.push({ tone: "info", message: `Guests: ${before.guestCount} → ${brief.guestCount}` });
    plan.budget.forEach((old, i) => {
      const next = budget[i]!; // scaleForGuests maps line for line
      if (next.amount !== old.amount) {
        effects.push({
          tone: "info",
          message: `${label(old.category)}: ${formatInr(old.amount)} → ${formatInr(next.amount)}, scaled with headcount`,
        });
      } else if (old.scalesWithGuests && old.source === "confirmed") {
        effects.push({
          tone: "warning",
          message: `${label(old.category)} was confirmed for ${before.guestCount} guests. Ask the vendor to re-quote for ${brief.guestCount}.`,
        });
      }
    });
  }

  if (brief.totalBudget !== before.totalBudget) {
    effects.push({
      tone: "info",
      message: `Budget: ${formatInr(before.totalBudget)} → ${formatInr(brief.totalBudget)}`,
    });
  }

  if (brief.tier !== before.tier) {
    effects.push({
      tone: "info",
      message: `Experience level: ${before.tier} → ${brief.tier}. Catering assumption is now about ${formatInr(CATERING_PER_GUEST[brief.tier])} per guest.`,
    });
  }

  if (brief.priorities.join() !== before.priorities.join()) {
    effects.push({
      tone: "info",
      message: brief.priorities.length
        ? `Protected when cutting: ${brief.priorities.map(label).join(", ")}`
        : "No categories are protected when cutting",
    });
  }

  if (brief.eventDate !== before.eventDate) {
    tasks = rescheduleOpenTasks(tasks, brief.eventType, brief.eventDate, today);
    const shift = daysBetween(before.eventDate, brief.eventDate);
    const previousDue = new Map(plan.tasks.map((t) => [t.id, t.dueDate]));
    const moved = tasks.filter((t) => t.dueDate !== previousDue.get(t.id)).length;
    effects.push({
      tone: "info",
      message: `Event moved ${Math.abs(shift)} days ${shift < 0 ? "earlier" : "later"}, to ${formatDate(brief.eventDate)}. ${moved} open tasks rescheduled.`,
    });

    const window = planningWindow(brief.eventType, brief.eventDate, today);
    if (window.compressed) {
      effects.push({
        tone: "warning",
        message: `Only ${window.days} days left against an ideal ${window.idealDays}, so the schedule is compressed and tasks will overlap.`,
      });
    }
    const urgent = tasks.filter((t) => taskHealth(t, today) === "due-soon");
    if (urgent.length) {
      effects.push({
        tone: "warning",
        message: `Due within a week: ${urgent.map((t) => t.title).join("; ")}`,
      });
    }
  }

  const summary = summariseBudget(budget, brief);
  if (summary.overBy > 0) {
    effects.push({
      tone: "warning",
      message: `The plan is now ${formatInr(summary.overBy)} over budget. Choose a trade-off in the budget section.`,
    });
  }
  if (summary.cateringLooksThin && summary.cateringPerGuest !== null) {
    effects.push({
      tone: "warning",
      message: `Catering works out to ${formatInr(summary.cateringPerGuest)} per guest, well under the ~${formatInr(summary.cateringAssumption)} assumed for a ${brief.tier} event.`,
    });
  }

  return { plan: stamp({ ...plan, brief, budget, tasks }, now), effects };
}

export function setTaskStatus(plan: Plan, taskId: string, status: Task["status"], now: Date = new Date()): Plan {
  return stamp({ ...plan, tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }, now);
}

export function delayTaskInPlan(plan: Plan, taskId: string, newDueDate: string, now: Date = new Date()): PlanUpdate {
  const { tasks, shifted } = delayTask(plan.tasks, taskId, newDueDate, plan.brief.eventDate);
  const effects: ChangeEffect[] = shifted.map((s) => ({
    tone: s.id === taskId ? "info" : "warning",
    message: `${s.title}: ${formatDate(s.from)} → ${formatDate(s.to)}`,
  }));
  if (shifted.length > 1) {
    effects.unshift({ tone: "warning", message: `${shifted.length - 1} dependent tasks had to move.` });
  }
  return { plan: stamp({ ...plan, tasks }, now), effects };
}

export function setBudgetAmount(plan: Plan, category: CategoryId, amount: number, now: Date = new Date()): Plan {
  return stamp({ ...plan, budget: setLineAmount(plan.budget, category, amount) }, now);
}

export function applyTradeoff(plan: Plan, option: TradeoffOption, now: Date = new Date()): Plan {
  if (!option.feasible) throw new PlanError("That option doesn't close the gap on its own.");
  const { budget, guestCount, totalBudget } = option.result;
  return stamp({ ...plan, budget, brief: { ...plan.brief, guestCount, totalBudget } }, now);
}

export function upsertVendor(plan: Plan, vendor: Vendor, now: Date = new Date()): Plan {
  const exists = plan.vendors.some((v) => v.id === vendor.id);
  const vendors = exists ? plan.vendors.map((v) => (v.id === vendor.id ? vendor : v)) : [...plan.vendors, vendor];
  return stamp({ ...plan, vendors }, now);
}

export function removeVendor(plan: Plan, vendorId: string, now: Date = new Date()): Plan {
  // A booked vendor's price is in the budget as confirmed, so the booking has to go first.
  if (plan.vendors.some((v) => v.id === vendorId && v.status === "booked")) {
    throw new PlanError("Cancel the booking before removing this vendor.");
  }
  return stamp({ ...plan, vendors: plan.vendors.filter((v) => v.id !== vendorId) }, now);
}

function vendorIn(plan: Plan, vendorId: string): Vendor {
  const vendor = plan.vendors.find((v) => v.id === vendorId);
  if (!vendor) throw new PlanError("Vendor not found.");
  return vendor;
}

/** The quotes booked in `category`; a booking without a recorded quote adds nothing. */
function bookedIn(vendors: Vendor[], category: CategoryId): { total: number; count: number } {
  const booked = vendors.filter((v) => v.category === category && v.status === "booked");
  return { total: booked.reduce((sum, v) => sum + (v.quote ?? 0), 0), count: booked.length };
}

/**
 * Records a booking the user has made. The category's budget line becomes the
 * total of its booked quotes, marked confirmed, so it stops being rescaled or
 * cut. A second booking in a category (a photographer and a videographer, say)
 * adds to that total rather than replacing it.
 */
export function bookVendor(plan: Plan, vendorId: string, now: Date = new Date()): PlanUpdate {
  const vendor = vendorIn(plan, vendorId);
  if (vendor.status === "booked") throw new PlanError(`${vendor.name} is already booked.`);
  if (vendor.quote === null) throw new PlanError("Record the vendor's quote before marking it booked.");

  const vendors = plan.vendors.map((v) => (v.id === vendorId ? { ...v, status: "booked" as const } : v));
  const { total, count } = bookedIn(vendors, vendor.category);
  const line = plan.budget.find((l) => l.category === vendor.category);
  const budget = line
    ? plan.budget.map((l) => (l === line ? { ...l, amount: total, source: "confirmed" as const } : l))
    : [
        ...plan.budget,
        { category: vendor.category, amount: total, scalesWithGuests: false, source: "confirmed" as const },
      ];
  const effects: ChangeEffect[] = [
    {
      tone: "info",
      message: !line
        ? `${label(vendor.category)} added at ${formatInr(total)}`
        : count === 1
          ? `${label(vendor.category)} confirmed at ${formatInr(total)} (estimate was ${formatInr(line.amount)})`
          : `${label(vendor.category)} now ${formatInr(total)} confirmed across ${count} vendors`,
    },
  ];

  const taskId = BOOKING_TASK[vendor.category];
  const tasks = plan.tasks.map((t) => (t.id === taskId && t.status === "todo" ? { ...t, status: "done" as const } : t));
  const completed = plan.tasks.find((t) => t.id === taskId && t.status === "todo");
  if (completed) effects.push({ tone: "info", message: `Marked “${completed.title}” as done` });

  const next = stamp({ ...plan, budget, tasks, vendors }, now);
  const summary = summariseBudget(budget, next.brief);
  if (summary.overBy > 0) {
    effects.push({ tone: "warning", message: `The plan is now ${formatInr(summary.overBy)} over budget.` });
  }
  return { plan: next, effects };
}

/**
 * Cancels a booking. The vendor goes back to quoted and the category's
 * confirmed amount is recalculated from the bookings that remain. With none
 * left, the line is an estimate again at the same figure, and the booking
 * task is reopened, since nothing is booked for it any more.
 */
export function cancelBooking(plan: Plan, vendorId: string, now: Date = new Date()): PlanUpdate {
  const vendor = vendorIn(plan, vendorId);
  if (vendor.status !== "booked") throw new PlanError(`${vendor.name} isn't booked.`);

  const vendors = plan.vendors.map((v) => (v.id === vendorId ? { ...v, status: "quoted" as const } : v));
  const { total, count } = bookedIn(vendors, vendor.category);
  const budget = plan.budget.map((line) => {
    if (line.category !== vendor.category) return line;
    return count > 0 ? { ...line, amount: total } : { ...line, source: "estimate" as const };
  });
  const effects: ChangeEffect[] = [
    count > 0
      ? {
          tone: "info",
          message: `${label(vendor.category)} now ${formatInr(total)} confirmed across ${count} ${count === 1 ? "vendor" : "vendors"}`,
        }
      : {
          tone: "warning",
          message: `${label(vendor.category)} is an estimate again. Get fresh quotes before rebooking.`,
        },
  ];

  const taskId = BOOKING_TASK[vendor.category];
  const reopened = count === 0 ? plan.tasks.find((t) => t.id === taskId && t.status === "done") : undefined;
  const tasks = reopened ? plan.tasks.map((t) => (t === reopened ? { ...t, status: "todo" as const } : t)) : plan.tasks;
  if (reopened) effects.push({ tone: "warning", message: `Reopened “${reopened.title}”` });

  return { plan: stamp({ ...plan, budget, tasks, vendors }, now), effects };
}

function withPayments(plan: Plan, vendorId: string, update: (payments: Payment[]) => Payment[], now: Date): Plan {
  const vendor = vendorIn(plan, vendorId);
  const vendors = plan.vendors.map((v) => (v === vendor ? { ...v, payments: update(v.payments) } : v));
  return stamp({ ...plan, vendors }, now);
}

/** Schedules a payment to a vendor, and warns when the schedule adds up to more than their quote. */
export function addPayment(plan: Plan, vendorId: string, payment: Payment, now: Date = new Date()): PlanUpdate {
  if (!PaymentSchema.safeParse(payment).success) {
    throw new PlanError("A payment needs a name, an amount above ₹0 and a real due date.");
  }
  const vendor = vendorIn(plan, vendorId);
  const next = withPayments(plan, vendorId, (payments) => [...payments, payment], now);
  const scheduled = [...vendor.payments, payment].reduce((sum, p) => sum + p.amount, 0);
  const effects: ChangeEffect[] = [
    {
      tone: "info",
      message: `${payment.label}: ${formatInr(payment.amount)} to ${vendor.name}, due ${formatDate(payment.dueDate)}`,
    },
  ];
  if (vendor.quote !== null && scheduled > vendor.quote) {
    effects.push({
      tone: "warning",
      message: `Payments to ${vendor.name} add up to ${formatInr(scheduled)}, more than their ${formatInr(vendor.quote)} quote.`,
    });
  }
  return { plan: next, effects };
}

export function setPaymentPaid(plan: Plan, vendorId: string, paymentId: string, paid: boolean, now = new Date()): Plan {
  return withPayments(
    plan,
    vendorId,
    (payments) => payments.map((p) => (p.id === paymentId ? { ...p, paid } : p)),
    now,
  );
}

export function removePayment(plan: Plan, vendorId: string, paymentId: string, now: Date = new Date()): Plan {
  return withPayments(plan, vendorId, (payments) => payments.filter((p) => p.id !== paymentId), now);
}
