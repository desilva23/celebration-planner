import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { TODAY, weddingBrief, venueVendor, line, messages } from "./fixtures.test-helpers";
import { formatInr } from "./format";
import { addGuest, removeGuest, setRsvp } from "./guests";
import {
  applyChange,
  applyTradeoff,
  createPlan,
  delayTaskInPlan,
  PlanError,
  setBudgetAmount,
  setTaskStatus,
} from "./plan";
import { PlanSchema, type PlanChange } from "./schema";
import { tradeoffOptions } from "./tradeoffs";
import {
  addPayment,
  bookVendor,
  cancelBooking,
  removePayment,
  removeVendor,
  setPaymentPaid,
  upsertVendor,
} from "./vendors";

const NOW = new Date("2026-10-25T06:30:00Z");
const LATER = new Date("2026-10-26T09:00:00Z");

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("createPlan", () => {
  it("refuses an event date that isn't in the future", () => {
    expect(() => createPlan(weddingBrief({ eventDate: TODAY }), TODAY)).toThrow("Pick an event date after today.");
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
    const withGuest = deepFreeze(addGuest(base, { id: "g", name: "The Sharmas", partySize: 4, rsvp: "pending" }));
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
      setPaymentPaid(withPayment, { vendorId: "v1", paymentId: "p" }, true),
      removePayment(withPayment, { vendorId: "v1", paymentId: "p" }),
      addGuest(plan, { id: "g", name: "The Sharmas", partySize: 4, rsvp: "pending" }),
      setRsvp(withGuest, "g", "yes"),
      removeGuest(withGuest, "g"),
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
    expect(effects).toContainEqual({
      tone: "warning",
      message: "Catering was confirmed for 200 guests. Ask the vendor to re-quote for 260.",
    });
  });

  it("says how much each headcount-based line moved", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    const before = line(plan, "catering").amount;
    const { effects } = applyChange(plan, { guestCount: 250 }, TODAY);
    expect(effects).toContainEqual({
      tone: "info",
      message: `Catering: ${formatInr(before)} → ${formatInr(Math.round(before * 1.25))}, scaled with headcount`,
    });
  });

  it("doesn't ask for a re-quote on an estimate that happens not to change", () => {
    // Nothing set aside for invitations: still ₹0 at the new headcount, and never confirmed.
    const plan = setBudgetAmount(createPlan(weddingBrief(), TODAY), "invitations", 0);
    const { effects } = applyChange(plan, { guestCount: 260 }, TODAY);
    expect(messages(effects).filter((m) => m.startsWith("Invitations"))).toEqual([]);
  });

  it("refuses to move the event into the past", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    expect(() => applyChange(plan, { eventDate: addDays(TODAY, -1) }, TODAY)).toThrow(PlanError);
  });

  it("explains a new budget, experience level and priorities", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    const change: PlanChange = { totalBudget: 820_000, tier: "premium", priorities: ["venue", "decor"] };
    const { effects } = applyChange(plan, change, TODAY);
    expect(messages(effects)).toEqual([
      "Budget: ₹8,00,000 → ₹8,20,000",
      "Experience level: standard → premium. Catering assumption is now about ₹1,600 per guest.",
      "Protected when cutting: Venue, Decor",
    ]);
  });

  it("says when nothing is protected any more", () => {
    const { effects } = applyChange(createPlan(weddingBrief(), TODAY), { priorities: [] }, TODAY);
    expect(messages(effects)).toEqual(["No categories are protected when cutting"]);
  });

  it("reschedules the open tasks when the event is postponed, and nothing else", () => {
    // A finished task keeps its date, so it isn't counted as moved.
    const plan = setTaskStatus(createPlan(weddingBrief(), TODAY), "budget", "done");
    const open = plan.tasks.filter((t) => t.status !== "done").length;
    const { effects } = applyChange(plan, { eventDate: addDays(plan.brief.eventDate, 10) }, TODAY);
    expect(effects).toEqual([
      { tone: "info", message: `Event moved 10 days later, to 11 Mar 2027. ${open} open tasks rescheduled.` },
    ]);
  });

  it("warns when a new date squeezes the schedule and makes tasks urgent", () => {
    const { plan, effects } = applyChange(createPlan(weddingBrief(), TODAY), { eventDate: addDays(TODAY, 10) }, TODAY);
    // Only the tasks now due in the next seven days, not the whole list.
    const dueSoon = plan.tasks.filter((t) => t.dueDate <= addDays(TODAY, 7)).map((t) => t.title);
    expect(dueSoon.length).toBeGreaterThan(0);
    expect(dueSoon.length).toBeLessThan(plan.tasks.length);
    expect(messages(effects.filter((e) => e.tone === "warning"))).toEqual([
      "Only 10 days left against an ideal 120, so the schedule is compressed and tasks will overlap.",
      `Due within a week: ${dueSoon.join("; ")}`,
    ]);
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
