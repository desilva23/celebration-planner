import { describe, expect, it } from "vitest";
import { allocateBudget } from "../domain/budget";
import { TODAY, weddingBrief } from "../domain/fixtures.test-helpers";
import { CATEGORIES, EVENT_TYPES, type EventBrief } from "../domain/schema";
import { IdeasResultSchema, InterpretResultSchema, VendorBriefResultSchema } from "./contracts";
import { ideasFallback, interpretFallback, vendorBriefFallback } from "./fallbacks";

describe("interpretFallback", () => {
  const brief = weddingBrief();
  const read = (message: string, current: EventBrief | null = brief) =>
    interpretFallback({ message, brief: current, today: TODAY });

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

  it.each([
    ["10 fewer guests", 190],
    ["twenty more people", 220],
    ["5 extra guests", 205],
    ["30 less attendees", 170],
    ["500 fewer guests", 1],
  ])("reads a headcount relative to the plan: %s", (message, guestCount) => {
    expect(read(message).updates.guestCount).toBe(guestCount);
  });

  it("ignores relative changes when there's no plan for them to be relative to", () => {
    expect(read("50 more guests, two weeks earlier, budget dropped by 80k", null).updates).toMatchObject({
      guestCount: null,
      eventDate: null,
      totalBudget: null,
    });
  });

  it("ignores counts it can't read", () => {
    expect(read("several more guests, a few weeks later").updates).toMatchObject({ guestCount: null, eventDate: null });
  });

  it.each([
    ["the budget increased by 1 lakh", 900_000],
    ["budget went up by ₹50,000", 850_000],
    ["our budget is ₹5,00,000", 500_000],
    ["budget of 8 lakh", 800_000],
    ["Rs. 3,00,000 in total", 300_000],
    ["we can spend 12 lakhs", 1_200_000],
    ["around 1.5 crore", 15_000_000],
  ])("reads a budget: %s", (message, totalBudget) => {
    expect(read(message).updates.totalBudget).toBe(totalBudget);
  });

  it("ignores a budget change with more digits than it can read", () => {
    expect(read(`budget dropped by ${"9".repeat(400)}`).updates.totalBudget).toBeNull();
  });

  it("ignores small figures, which are more likely prices than budgets", () => {
    const result = read("the hall charges ₹500 a head");
    expect(result.updates.totalBudget).toBeNull();
    expect(result.clarifyingQuestion).toMatch(/^What changed\?/);
  });

  it.each([
    ["2 weeks later", "2027-03-15"],
    ["three days earlier", "2027-02-26"],
    ["a month sooner", "2027-01-30"],
    ["pushed back by 1 week", "2027-03-08"],
    ["brought forward by a month", "2027-01-30"],
    ["preponed by 5 days", "2027-02-24"],
  ])("moves the date: %s", (message, eventDate) => {
    expect(read(message).updates.eventDate).toBe(eventDate);
  });

  // Regression: these used to be proposed as-is and, once applied, made the
  // saved plan fail validation, so it vanished on the next page load.
  it.each([
    ["we now have 6000 guests", "guestCount", /up to 5,000/],
    ["0 guests", "guestCount", /How many guests/],
    ["the budget is 15 crore", "totalBudget", /up to ₹10,00,00,000/],
    ["budget increased by 2 crore", "totalBudget", /up to ₹10,00,00,000/],
    ["move it to 2027-02-30", "eventDate", /isn't on the calendar/],
  ] as const)("asks instead of proposing a value the plan can't hold: %s", (message, field, question) => {
    const result = read(message, weddingBrief({ totalBudget: 90_000_000 }));
    expect(result.updates[field]).toBeNull();
    expect(result.clarifyingQuestion).toMatch(question);
  });

  it.each([
    ["a birthday party for 40 people", "birthday", "Understood: a birthday, 40 guests."],
    ["our 25th anniversary", "anniversary", "Understood: an anniversary."],
    ["society puja", "community", "Understood: a community."],
    ["the reception", "wedding", "Understood: a wedding."],
  ])("recognises the occasion for a new plan: %s", (message, eventType, understood) => {
    expect(read(message, null)).toMatchObject({ updates: { eventType }, understood });
    expect(read(message).updates.eventType).toBeNull();
  });

  it.each([
    ["we care most about decor and music", ["decor", "entertainment"]],
    ["the venue and photos are important", ["photography", "venue"]],
    ["outfits matter most", ["attire"]],
  ])("reads what matters most: %s", (message, priorities) => {
    expect(read(message).updates.priorities).toEqual(priorities);
  });

  it("leaves priorities alone when the emphasis isn't on a budget category", () => {
    expect(read("the date matters most").updates.priorities).toBeNull();
  });

  it.each([
    ["keep it intimate", "simple"],
    ["a lavish affair", "premium"],
    ["small but grand", "premium"],
  ])("reads the experience level: %s", (message, tier) => {
    expect(read(message).updates.tier).toBe(tier);
  });

  it("asks what changed when nothing is recognisable", () => {
    expect(read("hello there")).toMatchObject({
      understood: "I couldn't pick out a specific change.",
      clarifyingQuestion: expect.stringMatching(/^What changed\?/),
    });
  });

  it("always answers within the same contract the AI is held to", () => {
    const messages = [
      "We've got 50 more guests now, budget dropped by 80k and the event is happening two weeks earlier",
      "Planning a wedding for 300 guests on 2027-01-20, budget is 12 lakh, keep it simple",
      "6000 guests", "budget is 20 crore", "2027-13-45", "food matters most", "hello", "",
    ];
    for (const message of messages) {
      for (const current of [brief, null]) {
        expect(InterpretResultSchema.safeParse(read(message, current)).success, message).toBe(true);
      }
    }
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

  it("picks up to three ideas that suit the occasion", () => {
    const brief = weddingBrief({ eventType: "birthday" });
    expect(ideasFallback({ brief, budget: allocateBudget(brief) }).ideas.map((i) => i.title)).toEqual([
      "Regional banana-leaf feast",
      "Candid storytelling coverage",
      "Pastel garden party",
    ]);
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

describe("vendorBriefFallback", () => {
  it("always covers headcount changes and cancellation", () => {
    const { questions } = vendorBriefFallback({ category: "catering", brief: weddingBrief(), budgetForCategory: 256_000 });
    expect(questions.join(" ")).toMatch(/guest count changes/);
    expect(questions.join(" ")).toMatch(/cancellation/);
  });

  it("falls back to general advice for a vendor type without specifics", () => {
    const result = vendorBriefFallback({ category: "attire", brief: weddingBrief(), budgetForCategory: 64_000 });
    expect(result.watchOuts).toEqual(["Taxes and service charges added on top of the quote"]);
    expect(result.questions).toHaveLength(4);
  });

  it("describes the event, mentioning the city and notes only when there are some", () => {
    const full = vendorBriefFallback({ category: "venue", brief: weddingBrief({ notes: "x".repeat(300) }), budgetForCategory: 176_000 });
    expect(full.requirements).toEqual([
      "200 guests on 1 Mar 2027 in Chennai",
      "Planned spend around ₹1,76,000",
      `Your notes: ${"x".repeat(120)}`,
    ]);
    const bare = vendorBriefFallback({ category: "venue", brief: weddingBrief({ city: "", notes: "" }), budgetForCategory: 0 });
    expect(bare.requirements).toEqual(["200 guests on 1 Mar 2027", "Planned spend around ₹0"]);
  });

  it.each(CATEGORIES)("answers within the AI's contract for %s", (category) => {
    const result = vendorBriefFallback({ category, brief: weddingBrief({ notes: "n".repeat(1000) }), budgetForCategory: 1 });
    expect(VendorBriefResultSchema.safeParse(result).success).toBe(true);
  });
});
