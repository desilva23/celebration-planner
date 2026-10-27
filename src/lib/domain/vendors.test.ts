import { describe, expect, it } from "vitest";
import { TODAY, weddingBrief, venueVendor, line, messages } from "./fixtures.test-helpers";
import { createPlan, setTaskStatus } from "./plan";
import { type Payment, type Vendor } from "./schema";
import { overBudgetBy } from "./tradeoffs";
import {
  addPayment,
  bookVendor,
  cancelBooking,
  removePayment,
  removeVendor,
  setPaymentPaid,
  upsertVendor,
} from "./vendors";

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

  it.each([
    ["venue", "venue"],
    ["catering", "caterer"],
    ["photography", "photographer"],
    ["decor", "decor"],
    ["entertainment", "entertainment"],
  ] as const)("marks the booking task done when booking %s", (category, taskId) => {
    const plan = upsertVendor(createPlan(weddingBrief(), TODAY), { ...venueVendor, category });
    const { plan: booked, effects } = bookVendor(plan, "v1");
    const task = booked.tasks.find((t) => t.id === taskId)!;
    expect(task.status).toBe("done");
    expect(messages(effects)).toContain(`Marked “${task.title}” as done`);
  });

  it("doesn't warn when a booking leaves the plan exactly on budget", () => {
    const fresh = createPlan(weddingBrief(), TODAY);
    expect(overBudgetBy(fresh)).toBe(0);
    const plan = upsertVendor(fresh, { ...venueVendor, quote: line(fresh, "venue").amount });
    expect(bookVendor(plan, "v1").effects.filter((e) => e.tone === "warning")).toEqual([]);
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
    expect(() => bookVendor(plan, "v1")).toThrow("Record the vendor's quote before marking it booked.");
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
    // The same with another vendor in the plan, and that other one can still go.
    const withDecorator = upsertVendor(booked, { ...venueVendor, id: "d1", category: "decor", name: "Petal Works" });
    expect(() => removeVendor(withDecorator, "v1")).toThrow("Cancel the booking before removing this vendor.");
    expect(removeVendor(withDecorator, "d1").vendors.map((v) => v.id)).toEqual(["v1"]);
  });

  it("leaves another category's booking confirmed", () => {
    let plan = upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor);
    plan = upsertVendor(plan, { ...venueVendor, id: "d1", category: "decor", name: "Petal Works", quote: 50_000 });
    plan = bookVendor(bookVendor(plan, "v1").plan, "d1").plan;
    const { plan: after, effects } = cancelBooking(plan, "v1");
    expect(line(after, "decor")).toMatchObject({ amount: 50_000, source: "confirmed" });
    expect(messages(effects)[0]).toBe("Venue is an estimate again. Get fresh quotes before rebooking.");
  });

  it("touches only its own category and its own booking task", () => {
    const booked = bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;
    const withOtherDone = setTaskStatus(booked, "budget", "done");
    const { plan } = cancelBooking(withOtherDone, "v1");
    expect(plan.budget.filter((l) => l.category !== "venue")).toEqual(
      withOtherDone.budget.filter((l) => l.category !== "venue"),
    );
    expect(plan.tasks.filter((t) => t.status === "done").map((t) => t.id)).toEqual(["budget"]);
  });
});

describe("payments", () => {
  const advance: Payment = { id: "pay1", label: "Advance", amount: 50_000, dueDate: "2026-11-15", paid: false };
  const booked = () => bookVendor(upsertVendor(createPlan(weddingBrief(), TODAY), venueVendor), "v1").plan;

  it("doesn't warn when payments add up to exactly the quote", () => {
    expect(addPayment(booked(), "v1", { ...advance, amount: 150_000 }).effects).toHaveLength(1);
  });

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
    plan = setPaymentPaid(plan, { vendorId: "v1", paymentId: "pay1" }, true);
    expect(plan.vendors[0]!.payments.map((p) => p.paid)).toEqual([true, false]);
    expect(plan.vendors[1]).toEqual(decorator);
    expect(setPaymentPaid(plan, { vendorId: "v1", paymentId: "pay1" }, false).vendors[0]!.payments[0]!.paid).toBe(
      false,
    );
    expect(removePayment(plan, { vendorId: "v1", paymentId: "pay1" }).vendors[0]!.payments.map((p) => p.id)).toEqual([
      "pay2",
    ]);
  });

  it("refuses a vendor that isn't in the plan", () => {
    expect(() => setPaymentPaid(booked(), { vendorId: "nope", paymentId: "pay1" }, true)).toThrow("Vendor not found.");
  });
});
