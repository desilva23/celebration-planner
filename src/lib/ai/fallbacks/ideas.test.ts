import { describe, expect, it } from "vitest";
import { allocateBudget } from "../../domain/budget";
import { weddingBrief } from "../../domain/fixtures.test-helpers";
import { formatInr } from "../../domain/format";
import { EVENT_TYPES } from "../../domain/schema";
import { IdeasResultSchema } from "../contracts";
import { ideasFallback } from "./ideas";

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

  it("picks up to three ideas that suit the occasion", () => {
    const brief = weddingBrief({ eventType: "birthday" });
    expect(ideasFallback({ brief, budget: allocateBudget(brief) }).ideas.map((i) => i.title)).toEqual([
      "Regional banana-leaf feast",
      "Candid storytelling coverage",
      "Pastel garden party",
    ]);
  });

  it("suggests different ideas for a community event", () => {
    const brief = weddingBrief({ eventType: "community" });
    expect(ideasFallback({ brief, budget: allocateBudget(brief) }).ideas.map((i) => i.title)).toEqual([
      "Marigold and brass courtyard",
      "Activity stations for all ages",
      "Live chaat and dosa counters",
    ]);
  });

  it("says how each idea was sized", () => {
    const budget = allocateBudget(weddingBrief());
    const catering = budget.find((l) => l.category === "catering")!.amount;
    const { ideas } = ideasFallback({ brief: weddingBrief(), budget });
    expect(ideas.find((i) => i.category === "catering")!.whyItFits).toBe(
      `Sized to your catering estimate of ${formatInr(catering)} for 200 guests.`,
    );
  });

  it.each(EVENT_TYPES)("gives every idea for a %s some details", (eventType) => {
    const brief = weddingBrief({ eventType });
    for (const idea of ideasFallback({ brief, budget: allocateBudget(brief) }).ideas) {
      expect(idea.details.length, idea.title).toBeGreaterThan(0);
    }
  });

  it("only suggests ideas for lines the budget has, in round ₹100s", () => {
    const budget = allocateBudget(weddingBrief()).filter((l) => l.category !== "decor");
    const { ideas } = ideasFallback({ brief: weddingBrief(), budget });
    expect(ideas.map((i) => i.category)).toEqual(["catering", "photography"]);
    for (const { min, max } of ideas.map((i) => i.estimatedCost)) expect([min % 100, max % 100]).toEqual([0, 0]);
  });

  it.each(EVENT_TYPES)("answers within the AI's contract for a %s", (eventType) => {
    const brief = weddingBrief({ eventType });
    expect(IdeasResultSchema.safeParse(ideasFallback({ brief, budget: allocateBudget(brief) })).success).toBe(true);
  });
});
