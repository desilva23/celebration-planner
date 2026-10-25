import { describe, expect, it } from "vitest";
import { allocateBudget } from "../domain/budget";
import { TODAY, weddingBrief } from "../domain/fixtures.test-helpers";
import { ideasFallback, interpretFallback, vendorBriefFallback } from "./fallbacks";

describe("interpretFallback", () => {
  const brief = weddingBrief();

  it("reads the explainer's replan message", () => {
    const { updates } = interpretFallback({
      message: "We've got 50 more guests now, budget dropped by 80k and the event is happening two weeks earlier",
      brief,
      today: TODAY,
    });
    expect(updates.guestCount).toBe(250);
    expect(updates.totalBudget).toBe(720_000);
    expect(updates.eventDate).toBe("2027-02-15");
  });

  it("reads a fresh brief", () => {
    const { updates } = interpretFallback({
      message: "Planning a wedding for 300 guests on 2027-01-20, budget is 12 lakh, keep it simple",
      brief: null,
      today: TODAY,
    });
    expect(updates).toMatchObject({
      eventType: "wedding", guestCount: 300, eventDate: "2027-01-20", totalBudget: 1_200_000, tier: "simple",
    });
  });

  it("picks up what matters most", () => {
    const { updates } = interpretFallback({
      message: "wedding for 200 guests, food and photos matter most",
      brief: null,
      today: TODAY,
    });
    expect(updates.priorities).toEqual(["catering", "photography"]);
  });

  it("ignores earlier clauses when picking priorities", () => {
    const { updates } = interpretFallback({ message: "the venue is booked, food matters most", brief: null, today: TODAY });
    expect(updates.priorities).toEqual(["catering"]);
  });

  it("asks instead of guessing when the change is vague", () => {
    const result = interpretFallback({ message: "our budget has decreased a bit", brief, today: TODAY });
    expect(result.updates.totalBudget).toBeNull();
    expect(result.clarifyingQuestion).toMatch(/how much/i);
  });

  it("won't move the event into the past", () => {
    const result = interpretFallback({ message: "it's now 2026-01-01", brief, today: TODAY });
    expect(result.updates.eventDate).toBeNull();
    expect(result.clarifyingQuestion).toBeTruthy();
  });

  it("handles postponements written verb-first", () => {
    const { updates } = interpretFallback({ message: "postponed by 10 days", brief, today: TODAY });
    expect(updates.eventDate).toBe("2027-03-11");
  });
});

describe("ideasFallback", () => {
  it("sizes ideas to the user's own budget lines", () => {
    const budget = allocateBudget(weddingBrief());
    const { ideas } = ideasFallback({ brief: weddingBrief(), budget });
    expect(ideas.length).toBeGreaterThan(0);
    for (const idea of ideas) {
      const line = budget.find((l) => l.category === idea.category)!;
      expect(idea.estimatedCost.max).toBeLessThanOrEqual(line.amount);
      expect(idea.estimatedCost.min).toBeLessThanOrEqual(idea.estimatedCost.max);
    }
  });
});

describe("vendorBriefFallback", () => {
  it("always covers headcount changes and cancellation", () => {
    const { questions } = vendorBriefFallback({ category: "catering", brief: weddingBrief(), budgetForCategory: 256_000 });
    expect(questions.join(" ")).toMatch(/guest count changes/);
    expect(questions.join(" ")).toMatch(/cancellation/);
  });
});
