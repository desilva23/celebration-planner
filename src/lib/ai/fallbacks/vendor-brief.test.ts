import { describe, expect, it } from "vitest";
import { weddingBrief } from "../../domain/fixtures.test-helpers";
import { CATEGORIES } from "../../domain/schema";
import { VendorBriefResultSchema } from "../contracts";
import { vendorBriefFallback } from "./vendor-brief";

describe("vendorBriefFallback", () => {
  it("always covers headcount changes and cancellation", () => {
    const { questions } = vendorBriefFallback({
      category: "catering",
      brief: weddingBrief(),
      budgetForCategory: 256_000,
    });
    expect(questions.join(" ")).toMatch(/guest count changes/);
    expect(questions.join(" ")).toMatch(/cancellation/);
  });

  it.each(["venue", "catering", "photography", "decor", "entertainment"] as const)(
    "adds questions and watch-outs specific to %s",
    (category) => {
      const result = vendorBriefFallback({ category, brief: weddingBrief(), budgetForCategory: 100_000 });
      expect(result.questions).toHaveLength(6);
      expect(result.watchOuts).toHaveLength(2);
    },
  );

  it("falls back to general advice for a vendor type without specifics", () => {
    const result = vendorBriefFallback({ category: "attire", brief: weddingBrief(), budgetForCategory: 64_000 });
    expect(result.watchOuts).toEqual(["Taxes and service charges added on top of the quote"]);
    expect(result.questions).toHaveLength(4);
  });

  it("describes the event, mentioning the city and notes only when there are some", () => {
    const full = vendorBriefFallback({
      category: "venue",
      brief: weddingBrief({ notes: "x".repeat(300) }),
      budgetForCategory: 176_000,
    });
    expect(full.requirements).toEqual([
      "200 guests on 1 Mar 2027 in Chennai",
      "Planned spend around ₹1,76,000",
      `Your notes: ${"x".repeat(120)}`,
    ]);
    const bare = vendorBriefFallback({
      category: "venue",
      brief: weddingBrief({ city: "", notes: "" }),
      budgetForCategory: 0,
    });
    expect(bare.requirements).toEqual(["200 guests on 1 Mar 2027", "Planned spend around ₹0"]);
  });

  it.each(CATEGORIES)("answers within the AI's contract for %s", (category) => {
    const result = vendorBriefFallback({
      category,
      brief: weddingBrief({ notes: "n".repeat(1000) }),
      budgetForCategory: 1,
    });
    expect(VendorBriefResultSchema.safeParse(result).success).toBe(true);
  });
});
