// Vendors, bookings and payments. Like every plan operation, each function is
// pure: it returns a new plan and, where it helps, what changed.

import { CATEGORY_META } from "./assumptions";
import { summariseBudget } from "./budget";
import { formatDate, formatInr } from "./format";
import { PlanError, stamp, type ChangeEffect, type PlanUpdate } from "./plan";
import { PaymentSchema, type CategoryId, type Payment, type Plan, type Vendor } from "./schema";

/** Booking a vendor in one of these categories completes the matching task. */
const BOOKING_TASK: Partial<Record<CategoryId, string>> = {
  venue: "venue",
  catering: "caterer",
  photography: "photographer",
  decor: "decor",
  entertainment: "entertainment",
};

const label = (category: CategoryId) => CATEGORY_META[category].label;

/** A payment: the vendor it's owed to, and its own id. */
export interface PaymentRef {
  vendorId: string;
  paymentId: string;
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
  const tasks = plan.tasks.map((t) => (t.id === taskId ? { ...t, status: "done" as const } : t));
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

export function setPaymentPaid(plan: Plan, { vendorId, paymentId }: PaymentRef, paid: boolean, now = new Date()): Plan {
  return withPayments(
    plan,
    vendorId,
    (payments) => payments.map((p) => (p.id === paymentId ? { ...p, paid } : p)),
    now,
  );
}

export function removePayment(plan: Plan, { vendorId, paymentId }: PaymentRef, now: Date = new Date()): Plan {
  return withPayments(plan, vendorId, (payments) => payments.filter((p) => p.id !== paymentId), now);
}
