import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { applyChange, bookVendor, createPlan, PlanError, setTaskStatus, upsertVendor } from "./plan";
import type { Plan } from "./schema";
import { tradeoffOptions } from "./tradeoffs";

const line = (plan: Plan, category: string) => plan.budget.find((l) => l.category === category)!;

describe("createPlan", () => {
  it("refuses an event date that isn't in the future", () => {
    expect(() => createPlan(weddingBrief({ eventDate: TODAY }), TODAY)).toThrow(PlanError);
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
      id: "v1", category: "photography", name: "Lens & Light", contact: "", quote: 70_000, status: "quoted", notes: "",
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
      expect(t.dueDate < before.tasks[i].dueDate).toBe(true);
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
      id: "c1", category: "catering", name: "Annapoorna", contact: "", quote: 250_000, status: "quoted", notes: "",
    });
    plan = bookVendor(plan, "c1").plan;
    const { effects } = applyChange(plan, { guestCount: 260 }, TODAY);
    expect(effects.some((e) => e.tone === "warning" && /re-quote/.test(e.message))).toBe(true);
  });

  it("refuses to move the event into the past", () => {
    const plan = createPlan(weddingBrief(), TODAY);
    expect(() => applyChange(plan, { eventDate: addDays(TODAY, -1) }, TODAY)).toThrow(PlanError);
  });
});

describe("bookVendor", () => {
  it("confirms the price and completes the booking task", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      id: "v1", category: "venue", name: "Lotus Hall", contact: "", quote: 150_000, status: "quoted", notes: "",
    });
    const { plan: booked } = bookVendor(plan, "v1");
    expect(line(booked, "venue")).toMatchObject({ amount: 150_000, source: "confirmed" });
    expect(booked.tasks.find((t) => t.id === "venue")!.status).toBe("done");
    expect(booked.vendors[0].status).toBe("booked");
  });

  it("needs a quote before booking", () => {
    let plan = createPlan(weddingBrief(), TODAY);
    plan = upsertVendor(plan, {
      id: "v1", category: "venue", name: "Lotus Hall", contact: "", quote: null, status: "considering", notes: "",
    });
    expect(() => bookVendor(plan, "v1")).toThrow(PlanError);
  });
});
