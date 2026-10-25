import { describe, expect, it } from "vitest";
import { totalIdeaCost } from "./idea-cost";

describe("totalIdeaCost", () => {
  it("derives the estimate from the breakdown and fixes swapped bounds", () => {
    const idea = totalIdeaCost({
      title: "Feast",
      summary: "",
      whyItFits: "",
      details: [],
      category: "catering",
      assumptions: [],
      costBreakdown: [
        { item: "Food, 200 plates", min: 200_000, max: 220_000 },
        { item: "Service staff", min: 30_000, max: 20_000 },
      ],
    });
    expect(idea.estimatedCost).toEqual({ min: 220_000, max: 250_000 });
    expect(idea.costBreakdown[1]).toMatchObject({ min: 20_000, max: 30_000 });
  });
});
