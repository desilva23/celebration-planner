import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import {
  addPayment,
  applyChange,
  applyTradeoff,
  bookVendor,
  cancelBooking,
  createPlan,
  delayTaskInPlan,
  PlanError,
  removePayment,
  removeVendor,
  setBudgetAmount,
  setPaymentPaid,
  setTaskStatus,
  upsertVendor,
} from "./plan";
import { PlanSchema, type Payment, type Plan, type PlanChange, type Vendor } from "./schema";
import { tradeoffOptions } from "./tradeoffs";

const NOW = new Date("2026-10-25T06:30:00Z");
const LATER = new Date("2026-10-26T09:00:00Z");

const line = (plan: Plan, category: string) => plan.budget.find((l) => l.category === category)!;
const messages = (effects: { message: string }[]) => effects.map((e) => e.message);

const venueVendor: Vendor = {
  id: "v1",
  category: "venue",
  name: "Lotus Hall",
  contact: "",
  quote: 150_000,
  status: "quoted",
  notes: "",
  payments: [],
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("createPlan", () => {
  it("refuses an event date that isn't in the future", () => {
    expect(() => createPlan(weddingBrief({ eventDate: TODAY }), TODAY)).toThrow(PlanError);
  });

  it("starts with no vendors and stamps both timestamps with the same moment", () => {
    const plan = createPlan(weddingBrief(), TODAY, NOW);
    expect(plan).toMatchObject({ version: 1, vendors: [], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
  });

  it("only schedules tasks for categories the event has a budget for", () => {
    const plan = createPlan(weddingBrief({ eventType: "community" }), TODAY);
    expect(plan.tasks.map((t) => t.id)).not.toContain("attire");
  });
});

// A plan that fails the schema is silently dropped the next time the app loads
// it, so no operation may produce one.
describe("plan validity", () => {
  it.each<[PlanChange, RegExp]>([
    [{ guestCount: 6000 }, /from 1 to 5,000/],
    [{ guestCount: 0 }, /from 1 to 5,000/],
    [{ guestCount: 2.5 }, /whole number/],
    [{ totalBudget: 110_000_000 }, /between ₹1,000 and ₹10,00,00,000/],
    [{ eventDate: "2027-02-30" }, /isn't a real calendar date/],
  ])("refuses %o instead of saving a plan that won't load again", (change, message) => {
    expect(() => applyChange(createPlan(weddingBrief(), TODAY), change, TODAY)).toThrow(message);
  });

  it("refuses to create a plan that won't load again", () => {
    expect(() => createPlan(weddingBrief({ guestCount: 6000 }), TODAY)).toThrow(PlanError);
  });

  it("refuses an amount too large to store, with a general explanation", () => {
    expect(() => setBudgetAmount(createPlan(weddingBrief(), TODAY), "decor", 2 ** 53)).toThrow(
      "That change would leave the plan invalid, so it wasn't made.",
    );
  });

  it("never edits the plan it was given, and every result passes the schema", () => {
    const base = upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor);
    const plan = deepFreeze(base);
    const over = deepFreeze(applyChange(base, { guestCount: 250 }, TODAY).plan);
    const withPayment = deepFreeze(
      addPayment(base, "v1", { id: "p", label: "Advance", amount: 1, dueDate: "2026-11-15", paid: false }).plan,
    );
    // Writing to a frozen object throws in strict-mode modules, so any mutation fails here.
    const results = [
      applyChange(
        plan,
        { guestCount: 250, totalBudget: 700_000, eventDate: "2027-02-01", tier: "premium", priorities: [] },
        TODAY,
      ).plan,
      setTaskStatus(plan, "budget", "done"),
      delayTaskInPlan(plan, "venue", "2027-01-30").plan,
      setBudgetAmount(plan, "decor", 1),
      upsertVendor(plan, { ...venueVendor, quote: 1 }),
      removeVendor(plan, "v1"),
      bookVendor(plan, "v1").plan,
      cancelBooking(deepFreeze(bookVendor(plan, "v1").plan), "v1").plan,
      addPayment(plan, "v1", { id: "p", label: "Advance", amount: 1, dueDate: "2026-11-15", paid: false }).plan,
      setPaymentPaid(withPayment, "v1", "p", true),
      removePayment(withPayment, "v1", "p"),
      ...tradeoffOptions(over)
        .filter((o) => o.feasible)
        .map((o) => applyTradeoff(over, o)),
    ];
    for (const result of results) expect(PlanSchema.safeParse(result).success).toBe(true);
  });
});

describe("applyChange", () => {
  // The scenario the explainer asked every team to test: the user comes back
  // with more guests, less money and an earlier date. The plan should revise,
  // not restart.
  it("revises the plan for +50 guests, a smaller budget and an event two weeks earlier", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = setTaskStatus(plan, "budget", "done");
    plan = upsertVendor(plan, {
      id: "v1",
      category: "photography",
      name: "Lens & Light",
      contact: "",
      quote: 70_000,
      status: "quoted",
      notes: "",
      payments: [],
    });
    plan = bookVendor(plan, "v1").plan;
    const before = plan;

    const { plan: after, effects } = applyChange(
      before,
      { guestCount: 250, totalBudget: 720_000, eventDate: addDays(before.brief.eventDate, -14) },
      TODAY,
    );

    expect(after.brief).toMatchObject({ guestCount: 250, totalBudget: 720_000 });
    expect(line(after, "catering").amount).toBeGreaterThan(line(before, "catering").amount);
    // Work already done and prices already agreed survive the replan.
    expect(after.tasks.find((t) => t.id === "budget")).toEqual(before.tasks.find((t) => t.id === "budget"));
    expect(line(after, "photography")).toEqual(line(before, "photography"));
    // Every open task moves earlier and still lands before the event.
    after.tasks.forEach((t, i) => {
      if (t.status === "done") return;
      expect(t.dueDate < before.tasks[i]!.dueDate).toBe(true);
      expect(t.dueDate <= after.brief.eventDate).toBe(true);
    });
    // The user is told what happened and offered ways back into budget.
    const messages = effects.map((e) => e.message).join("\n");
    expect(messages).toMatch(/Guests: 200 → 250/);
    expect(messages).toMatch(/14 days earlier/);
    expect(messages).toMatch(/over budget/);
    expect(tradeoffOptions(after).some((o) => o.feasible)).toBe(true);
  });

  it("warns that a confirmed per-guest price needs a re-quote", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      id: "c1",
      category: "catering",
      name: "Annapoorna",
      contact: "",
      quote: 250_000,
      status: "quoted",
      notes: "",
      payments: [],
    });
    plan = bookVendor(plan, "c1").plan;
    const { effects } = applyChange(plan, { guestCount: 260 }, TODAY);
    expect(effects.some((e) => e.tone === "warning" && /re-quote/.test(e.message))).toBe(true);
  });

  it("refuses to move the event into the past", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    expect(() => applyChange(plan, { eventDate: addDays(TODAY, -1) }, TODAY)).toThrow(PlanError);
  });

  it("explains a new budget, experience level and priorities", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    const { effects } = applyChange(plan, { totalBudget: 820_000, tier: "premium", priorities: ["venue"] }, TODAY);
    expect(messages(effects)).toEqual([
      "Budget: ₹8,00,000 → ₹8,20,000",
      "Experience level: standard → premium. Catering assumption is now about ₹1,600 per guest.",
      "Protected when cutting: Venue",
    ]);
  });

  it("says when nothing is protected any more", () => {
    const { effects } = applyChange(createPlan(weddingBrief(), TODAY), { priorities: [] }, TODAY);
    expect(messages(effects)).toEqual(["No categories are protected when cutting"]);
  });

  it("reschedules when the event is postponed", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    const { effects } = applyChange(plan, { eventDate: addDays(plan.brief.eventDate, 10) }, TODAY);
    expect(messages(effects)[0]).toMatch(/^Event moved 10 days later, to 11 Mar 2027\. \d+ open tasks rescheduled\.$/);
  });

  it("warns when a new date squeezes the schedule and makes tasks urgent", () => {
    const { effects } = applyChange(createPlan(weddingBrief(), TODAY), { eventDate: addDays(TODAY, 10) }, TODAY);
    const warnings = messages(effects.filter((e) => e.tone === "warning"));
    expect(warnings[0]).toBe(
      "Only 10 days left against an ideal 120, so the schedule is compressed and tasks will overlap.",
    );
    expect(warnings[1]).toMatch(/^Due within a week: Agree the total budget and what matters most; /);
  });

  it("warns when catering looks thin for the experience level", () => {
    const plan = setBudgetAmount(createPlan(weddingBrief(), TODAY), "catering", 100_000);
    const { effects } = applyChange(plan, { tier: "premium" }, TODAY);
    expect(effects).toContainEqual({
      tone: "warning",
      message: "Catering works out to ₹500 per guest, well under the ~₹1,600 assumed for a premium event.",
    });
  });

  it("only restamps the plan when nothing actually changes", () => {
    const plan = createPlan(weddingBrief(), TODAY, NOW);
    const { plan: next, effects } = applyChange(plan, {}, TODAY, LATER);
    expect(effects).toEqual([]);
    expect(next).toEqual({ ...plan, updatedAt: LATER.toISOString() });
  });
});

describe("setTaskStatus", () => {
  it("marks a task done and back again, stamping each change", () => {
    const plan = createPlan(weddingBrief(), TODAY, NOW);
    const done = setTaskStatus(plan, "budget", "done", LATER);
    expect(done.tasks.find((t) => t.id === "budget")!.status).toBe("done");
    expect(done.updatedAt).toBe(LATER.toISOString());
    expect(setTaskStatus(done, "budget", "todo").tasks).toEqual(plan.tasks);
  });
});

describe("delayTaskInPlan", () => {
  const plan = createPlan(weddingBrief(), TODAY);
  const due = (id: string) => plan.tasks.find((t) => t.id === id)!.dueDate;

  it("reports the delayed task, then every dependent it pushed back", () => {
    const { effects } = delayTaskInPlan(plan, "venue", addDays(due("venue"), 45));
    const [summary, delayed, ...pushed] = effects;
    expect(summary).toEqual({ tone: "warning", message: `${pushed.length} dependent tasks had to move.` });
    expect(delayed).toMatchObject({ tone: "info", message: expect.stringMatching(/^Shortlist and book the venue: /) });
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.every((e) => e.tone === "warning")).toBe(true);
  });

  it("doesn't mention dependents when nothing else had to move", () => {
    const { effects } = delayTaskInPlan(plan, "run-sheet", addDays(due("run-sheet"), 2));
    expect(effects).toEqual([{ tone: "info", message: "Write the day-of run sheet: 25 Feb 2027 → 27 Feb 2027" }]);
  });
});

describe("upsertVendor / removeVendor", () => {
  it("adds vendors, replaces one by id in place, and removes one by id", () => {
    const decorator: Vendor = { ...venueVendor, id: "d1", category: "decor", name: "Petal Works" };
    let plan = upsertVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), decorator);
    plan = upsertVendor(plan, { ...venueVendor, quote: 160_000 });
    expect(plan.vendors).toEqual([{ ...venueVendor, quote: 160_000 }, decorator]);
    expect(removeVendor(plan, "v1").vendors).toEqual([decorator]);
  });
});

describe("bookVendor", () => {
  it("confirms the price and completes the booking task", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      id: "v1",
      category: "venue",
      name: "Lotus Hall",
      contact: "",
      quote: 150_000,
      status: "quoted",
      notes: "",
      payments: [],
    });
    const { plan: booked } = bookVendor(plan, "v1");
    expect(line(booked, "venue")).toMatchObject({ amount: 150_000, source: "confirmed" });
    expect(booked.tasks.find((t) => t.id === "venue")!.status).toBe("done");
    expect(booked.vendors[0]!.status).toBe("booked");
  });

  it("needs a quote before booking", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      id: "v1",
      category: "venue",
      name: "Lotus Hall",
      contact: "",
      quote: null,
      status: "considering",
      notes: "",
      payments: [],
    });
    expect(() => bookVendor(plan, "v1")).toThrow(PlanError);
  });

  it("refuses a vendor that isn't in the plan", () => {
    expect(() => bookVendor(createPlan(weddingBrief(), TODAY), "nope")).toThrow("Vendor not found.");
  });

  it("adds a confirmed line for a category the budget didn't have", () => {
    let plan = createPlan(weddingBrief({ eventType: "community" }), TODAY);
    plan = upsertVendor(plan, { ...venueVendor, id: "a1", category: "attire", quote: 20_000 });
    const { plan: booked, effects } = bookVendor(plan, "a1");
    expect(line(booked, "attire")).toEqual({
      category: "attire",
      amount: 20_000,
      scalesWithGuests: false,
      source: "confirmed",
    });
    expect(messages(effects)[0]).toBe("Attire added at ₹20,000");
  });

  it("doesn't complete a booking task twice", () => {
    let plan = setTaskStatus(createPlan(weddingBrief(), TODAY), "venue", "done");
    plan = upsertVendor(plan, venueVendor);
    expect(messages(bookVendor(plan, "v1").effects)).toEqual(["Venue confirmed at ₹1,50,000 (estimate was ₹1,76,000)"]);
  });

  it("warns when the booked price pushes the plan over budget", () => {
    const plan = upsertVendor(createPlan(weddingBrief(), TODAY), { ...venueVendor, quote: 300_000 });
    expect(bookVendor(plan, "v1").effects.at(-1)).toEqual({
      tone: "warning",
      message: "The plan is now ₹1,24,000 over budget.",
    });
  });

  // Regression: a second booking in a category used to replace the first one's price.
  it("adds a second booking in the same category to the confirmed total", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      ...venueVendor,
      id: "p1",
      category: "photography",
      name: "Lens & Light",
      quote: 60_000,
    });
    plan = upsertVendor(plan, {
      ...venueVendor,
      id: "p2",
      category: "photography",
      name: "Frame Films",
      quote: 45_000,
    });
    plan = bookVendor(plan, "p1").plan;
    const { plan: both, effects } = bookVendor(plan, "p2");
    expect(line(both, "photography")).toMatchObject({ amount: 105_000, source: "confirmed" });
    // Two bookings at ₹1,05,000 against an ₹80,000 estimate also push the plan over budget.
    expect(messages(effects)).toEqual([
      "Photography now ₹1,05,000 confirmed across 2 vendors",
      "The plan is now ₹25,000 over budget.",
    ]);
  });

  it("won't book the same vendor twice", () => {
    const plan = bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;
    expect(() => bookVendor(plan, "v1")).toThrow("Lotus Hall is already booked.");
  });
});

describe("cancelBooking", () => {
  const twoPhotographers = () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      ...venueVendor,
      id: "p1",
      category: "photography",
      name: "Lens & Light",
      quote: 60_000,
    });
    plan = upsertVendor(plan, {
      ...venueVendor,
      id: "p2",
      category: "photography",
      name: "Frame Films",
      quote: 45_000,
    });
    return bookVendor(bookVendor(plan, "p1").plan, "p2").plan;
  };

  it("recalculates the confirmed total from the bookings that remain", () => {
    const { plan, effects } = cancelBooking(twoPhotographers(), "p2");
    expect(line(plan, "photography")).toMatchObject({ amount: 60_000, source: "confirmed" });
    expect(plan.vendors.find((v) => v.id === "p2")!.status).toBe("quoted");
    expect(messages(effects)).toEqual(["Photography now ₹60,000 confirmed across 1 vendor"]);
  });

  it("keeps counting when several bookings remain", () => {
    const drone = { ...venueVendor, id: "p3", category: "photography" as const, name: "Sky Shots", quote: 15_000 };
    const three = bookVendor(upsertVendor(twoPhotographers(), drone), "p3").plan;
    expect(messages(cancelBooking(three, "p1").effects)).toEqual([
      "Photography now ₹60,000 confirmed across 2 vendors",
    ]);
  });

  it("counts a booking with no recorded quote as nothing", () => {
    const plan = twoPhotographers();
    const odd = { ...plan, vendors: plan.vendors.map((v) => (v.id === "p1" ? { ...v, quote: null } : v)) };
    expect(line(cancelBooking(odd, "p2").plan, "photography").amount).toBe(0);
  });

  it("makes the line an estimate again and reopens the booking task when none remain", () => {
    const booked = bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;
    const { plan, effects } = cancelBooking(booked, "v1");
    expect(line(plan, "venue")).toMatchObject({ amount: 150_000, source: "estimate" });
    expect(plan.tasks.find((t) => t.id === "venue")!.status).toBe("todo");
    expect(effects).toEqual([
      { tone: "warning", message: "Venue is an estimate again. Get fresh quotes before rebooking." },
      { tone: "warning", message: "Reopened “Shortlist and book the venue”" },
    ]);
  });

  it("leaves a booking task alone when it's already open", () => {
    const booked = bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;
    const reopened = setTaskStatus(booked, "venue", "todo");
    expect(cancelBooking(reopened, "v1").effects).toHaveLength(1);
  });

  it("refuses a vendor that isn't booked, or isn't in the plan", () => {
    const plan = upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor);
    expect(() => cancelBooking(plan, "v1")).toThrow("Lotus Hall isn't booked.");
    expect(() => cancelBooking(plan, "nope")).toThrow("Vendor not found.");
  });

  it("must come before removing a booked vendor", () => {
    const booked = bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;
    expect(() => removeVendor(booked, "v1")).toThrow("Cancel the booking before removing this vendor.");
  });
});

describe("payments", () => {
  const advance: Payment = { id: "pay1", label: "Advance", amount: 50_000, dueDate: "2026-11-15", paid: false };
  const booked = () => bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;

  it("schedules a payment and says what is due when", () => {
    const { plan, effects } = addPayment(booked(), "v1", advance);
    expect(plan.vendors[0]!.payments).toEqual([advance]);
    expect(effects).toEqual([{ tone: "info", message: "Advance: ₹50,000 to Lotus Hall, due 15 Nov 2026" }]);
  });

  it("warns when payments add up to more than the quote", () => {
    const plan = addPayment(booked(), "v1", advance).plan;
    const { effects } = addPayment(plan, "v1", { ...advance, id: "pay2", label: "Balance", amount: 120_000 });
    expect(effects.at(-1)).toEqual({
      tone: "warning",
      message: "Payments to Lotus Hall add up to ₹1,70,000, more than their ₹1,50,000 quote.",
    });
  });

  it("doesn't compare against a quote that was never recorded", () => {
    const plan = upsertVendor(createPlan(weddingBrief(), TODAY), {
      ...venueVendor,
      quote: null,
      status: "considering",
    });
    expect(addPayment(plan, "v1", advance).effects).toHaveLength(1);
  });

  it.each([[{ amount: 0 }], [{ amount: 2.5 }], [{ label: "  " }], [{ dueDate: "2026-02-30" }]])(
    "refuses a payment the plan couldn't hold: %o",
    (overrides) => {
      expect(() => addPayment(booked(), "v1", { ...advance, ...overrides })).toThrow(
        "A payment needs a name, an amount above ₹0 and a real due date.",
      );
    },
  );

  it("marks one payment paid and back again, and removes it, leaving everything else alone", () => {
    const decorator: Vendor = { ...venueVendor, id: "d1", category: "decor", name: "Petal Works" };
    let plan = upsertVendor(booked(), decorator);
    plan = addPayment(plan, "v1", advance).plan;
    plan = addPayment(plan, "v1", { ...advance, id: "pay2", label: "Balance" }).plan;
    plan = setPaymentPaid(plan, "v1", "pay1", true);
    expect(plan.vendors[0]!.payments.map((p) => p.paid)).toEqual([true, false]);
    expect(plan.vendors[1]).toEqual(decorator);
    expect(setPaymentPaid(plan, "v1", "pay1", false).vendors[0]!.payments[0]!.paid).toBe(false);
    expect(removePayment(plan, "v1", "pay1").vendors[0]!.payments.map((p) => p.id)).toEqual(["pay2"]);
  });

  it("refuses a vendor that isn't in the plan", () => {
    expect(() => setPaymentPaid(booked(), "nope", "pay1", true)).toThrow("Vendor not found.");
  });
});
