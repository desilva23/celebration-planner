import { beforeEach, describe, expect, it, vi } from "vitest";
import { allocateBudget } from "../domain/budget";
import { TODAY, weddingBrief } from "../domain/fixtures.test-helpers";
import {
  CompareQuotesResultSchema,
  GeneratedIdeasSchema,
  InterpretResultSchema,
  VendorBriefResultSchema,
  type CompareQuotesRequest,
  type QuoteSummary,
} from "./contracts";
import { compareQuotes, interpret, prepareVendorBrief, suggestIdeas } from "./features";
import { generateStructured } from "./llm";
import { INTERPRET_SYSTEM, interpretPrompt, vendorBriefSystem } from "./prompts";

vi.mock("./llm", () => ({ generateStructured: vi.fn() }));
const generate = vi.mocked(generateStructured);

beforeEach(() => {
  generate.mockReset();
});

const summary = (overrides: Partial<QuoteSummary>): QuoteSummary => ({
  label: "A", total: null, perGuest: null, guestsCovered: null,
  inclusions: [], extraCharges: [], terms: [], needsClarification: [], ...overrides,
});

describe("interpret", () => {
  it("extracts changes with the lite model at temperature 0", async () => {
    const request = { message: "50 more guests", brief: weddingBrief(), today: TODAY };
    const reply = { updates: {}, understood: "250 guests.", clarifyingQuestion: null };
    generate.mockResolvedValueOnce(reply);
    await expect(interpret(request)).resolves.toBe(reply);
    expect(generate).toHaveBeenCalledWith({
      name: "interpret_result",
      schema: InterpretResultSchema,
      system: INTERPRET_SYSTEM,
      prompt: interpretPrompt(request),
      model: "lite",
      temperature: 0,
    });
  });
});

describe("suggestIdeas", () => {
  it("generates with the larger model and totals each idea from its own breakdown", async () => {
    generate.mockResolvedValueOnce({
      ideas: [{
        title: "Feast", summary: "", whyItFits: "", details: [], category: "catering", assumptions: [],
        costBreakdown: [{ item: "Food", min: 200_000, max: 220_000 }, { item: "Staff", min: 30_000, max: 20_000 }],
      }],
      followUpQuestion: "Any dietary needs?",
    });
    const result = await suggestIdeas({ brief: weddingBrief(), budget: allocateBudget(weddingBrief()) });
    expect(result.ideas[0].estimatedCost).toEqual({ min: 220_000, max: 250_000 });
    expect(result.followUpQuestion).toBe("Any dietary needs?");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ideas_result", schema: GeneratedIdeasSchema, model: "smart", temperature: 0.8, timeoutMs: 30_000 }),
    );
  });
});

describe("prepareVendorBrief", () => {
  it("prepares questions with the lite model, briefed on the vendor type", async () => {
    const reply = { requirements: [], questions: ["What's included?"], watchOuts: [] };
    generate.mockResolvedValueOnce(reply);
    await expect(prepareVendorBrief({ category: "decor", brief: weddingBrief(), budgetForCategory: 96_000 })).resolves.toBe(reply);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "vendor_brief_result", schema: VendorBriefResultSchema, system: vendorBriefSystem("decor"), model: "lite", temperature: 0.3 }),
    );
  });
});

describe("compareQuotes", () => {
  const request: CompareQuotesRequest = {
    category: "catering",
    guestCount: 200,
    budgetForCategory: 256_000,
    quotes: [
      { label: "Annapoorna", text: "Veg menu at Rs 1,250 per plate for up to 200 guests." },
      { label: "Saravana", text: "Rs 1,100 per plate, minimum 180 plates, GST extra." },
    ],
  };

  it("reads quotes with the lite model at temperature 0", async () => {
    generate.mockResolvedValueOnce({ quotes: [] });
    await compareQuotes(request);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "compare_quotes_result", schema: CompareQuotesResultSchema, model: "lite", temperature: 0 }),
    );
  });

  it("pairs each summary with its quote by label, even when the model reorders them", async () => {
    generate.mockResolvedValueOnce({
      quotes: [summary({ label: "Saravana", perGuest: 1100 }), summary({ label: "Annapoorna", perGuest: 1250 })],
    });
    const { quotes } = await compareQuotes(request);
    expect(quotes.map((q) => [q.label, q.perGuest])).toEqual([["Annapoorna", 1250], ["Saravana", 1100]]);
  });

  it("falls back to position when the model renames the quotes, keeping the user's labels", async () => {
    generate.mockResolvedValueOnce({
      quotes: [summary({ label: "Quote 1", perGuest: 1250 }), summary({ label: "Quote 2", perGuest: 1100 })],
    });
    const { quotes } = await compareQuotes(request);
    expect(quotes.map((q) => [q.label, q.perGuest])).toEqual([["Annapoorna", 1250], ["Saravana", 1100]]);
  });

  // Regression: both quotes used to be paired with the first matching summary.
  it("keeps two quotes with the same label apart", async () => {
    const sameName = { ...request, quotes: request.quotes.map((q) => ({ ...q, label: "Annapoorna" })) };
    generate.mockResolvedValueOnce({
      quotes: [summary({ label: "Annapoorna", perGuest: 1250 }), summary({ label: "Annapoorna", perGuest: 1100, terms: ["Minimum 180 plates"] })],
    });
    const { quotes } = await compareQuotes(sameName);
    expect(quotes.map((q) => [q.perGuest, q.terms])).toEqual([[1250, []], [1100, ["Minimum 180 plates"]]]);
  });

  it("says when a quote couldn't be read instead of leaving it out", async () => {
    generate.mockResolvedValueOnce({ quotes: [summary({ label: "Annapoorna", perGuest: 1250 })] });
    const { quotes } = await compareQuotes(request);
    expect(quotes[1]).toEqual(
      summary({ label: "Saravana", needsClarification: ["This quote couldn't be read. Check the text and try again."] }),
    );
  });

  it("drops any figure that isn't written in that quote's own text", async () => {
    generate.mockResolvedValueOnce({
      quotes: [summary({ label: "Annapoorna", total: 250_000, perGuest: 1250 }), summary({ label: "Saravana", perGuest: 1250 })],
    });
    const { quotes } = await compareQuotes(request);
    expect(quotes[0]).toMatchObject({ total: null, perGuest: 1250 });
    expect(quotes[1]).toMatchObject({ perGuest: null });
    expect(quotes[1].needsClarification[0]).toMatch(/per-guest price of ₹1,250 isn't stated/);
  });
});
