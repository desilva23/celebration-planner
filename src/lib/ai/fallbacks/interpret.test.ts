import { describe, expect, it } from "vitest";
import { TODAY, weddingBrief } from "../../domain/fixtures.test-helpers";
import { type EventBrief } from "../../domain/schema";
import { InterpretResultSchema } from "../contracts";
import { interpretFallback } from "./interpret";

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
      eventType: "wedding",
      guestCount: 300,
      eventDate: "2027-01-20",
      totalBudget: 1_200_000,
      tier: "simple",
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
    const { updates } = interpretFallback({
      message: "the venue is booked, food matters most",
      brief: null,
      today: TODAY,
    });
    expect(updates.priorities).toEqual(["catering"]);
  });

  it("asks instead of guessing when the change is vague", () => {
    const result = interpretFallback({ message: "our budget has decreased a bit", brief, today: TODAY });
    expect(result.updates.totalBudget).toBeNull();
    expect(result.clarifyingQuestion).toMatch(/how much/i);
  });

  it.each([
    ["12 lakh in all", 1_200_000],
    ["about 12lakh", 1_200_000],
    ["8 lakh, give or take", 800_000],
    ["5 lac", 500_000],
    ["1.25 crore all told", 12_500_000],
  ])("reads an amount in lakhs or crores on its own: %s", (message, totalBudget) => {
    expect(read(message).updates.totalBudget).toBe(totalBudget);
  });

  it.each(["the budget dropped a lot", "budget  fell", "the budget has  dropped"])(
    "asks by how much when the budget changed without a figure: %s",
    (message) => {
      expect(read(message)).toMatchObject({
        updates: { totalBudget: null },
        clarifyingQuestion: "By how much did the budget change? A rough figure is fine.",
      });
    },
  );

  it("treats today as too soon for the event", () => {
    expect(read(`move it to ${TODAY}`)).toMatchObject({
      updates: { eventDate: null },
      clarifyingQuestion: "That date would be in the past. What's the new date?",
    });
  });

  it("sums up everything it understood, for the user to confirm", () => {
    const message = "We now have 250 guests, budget 9 lakh, move it to 2027-04-01, food matters most, keep it simple";
    expect(read(message).understood).toBe(
      "Understood: 250 guests, a budget of ₹9,00,000, on 1 Apr 2027, protect catering, a simple feel.",
    );
  });

  // Regression: the summary named every category mentioned, though only four are protected.
  it("protects at most four categories, and says which", () => {
    const result = read("food photos venue decor and music matter most");
    expect(result.updates.priorities).toEqual(["catering", "photography", "venue", "decor"]);
    expect(result.understood).toBe("Understood: protect catering and photography and venue and decor.");
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
    ["we care about the venue", ["venue"]],
    ["food matters  most", ["catering"]],
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
      "6000 guests",
      "budget is 20 crore",
      "2027-13-45",
      "food matters most",
      "hello",
      "",
    ];
    for (const message of messages) {
      for (const current of [brief, null]) {
        expect(InterpretResultSchema.safeParse(read(message, current)).success, message).toBe(true);
      }
    }
  });
});
