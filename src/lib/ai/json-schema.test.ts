import { describe, expect, it } from "vitest";
import { CompareQuotesResultSchema, GeneratedIdeasSchema, IdeasResultSchema, InterpretResultSchema } from "./contracts";
import { fitToSchema, responseSchemas } from "./json-schema";

const LIMIT_KEYS = ["maxLength", "minLength", "pattern", "format", "maxItems", "minItems", "minimum", "maximum"];

function keysIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysIn(v, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysIn(v, found);
    }
  }
  return found;
}

describe("responseSchemas", () => {
  it.each([
    ["interpret", InterpretResultSchema],
    ["ideas", GeneratedIdeasSchema],
    ["quotes", CompareQuotesResultSchema],
  ])("sends a portable %s schema that strict mode accepts", (_, schema) => {
    const { portable } = responseSchemas(schema);
    const keys = keysIn(portable);
    for (const k of [...LIMIT_KEYS, "$schema"]) expect(keys.has(k), k).toBe(false);
    // Strict structured output needs every property required and no extras.
    const objects: Record<string, unknown>[] = [];
    (function collect(n: unknown) {
      if (Array.isArray(n)) return n.forEach(collect);
      if (!n || typeof n !== "object") return;
      const node = n as Record<string, unknown>;
      if (node.type === "object") objects.push(node);
      Object.values(node).forEach(collect);
    })(portable);
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect(new Set(o.required as string[])).toEqual(new Set(Object.keys(o.properties as object)));
    }
  });

  it("keeps the limits as hints the model can read", () => {
    const { portable } = responseSchemas(InterpretResultSchema);
    const understood = (portable.properties as Record<string, { description?: string }>).understood;
    expect(understood.description).toMatch(/at most 300 characters/);
  });
});

describe("fitToSchema", () => {
  const { full } = responseSchemas(GeneratedIdeasSchema);

  it("trims over-long replies so they validate", () => {
    const idea = {
      title: "T".repeat(200), summary: "s", whyItFits: "w", details: Array(10).fill("d"),
      category: "decor", costBreakdown: [{ item: "Flowers", min: 1000.4, max: 2000.6 }], assumptions: [],
    };
    const fitted = fitToSchema({ ideas: [idea, idea, idea, idea, idea], followUpQuestion: null }, full);
    const parsed = GeneratedIdeasSchema.parse(fitted);
    expect(parsed.ideas).toHaveLength(4);
    expect(parsed.ideas[0].title.length).toBeLessThanOrEqual(80);
    expect(parsed.ideas[0].details).toHaveLength(6);
    expect(parsed.ideas[0].costBreakdown[0]).toMatchObject({ min: 1000, max: 2001 });
  });

  it("leaves genuinely wrong replies for validation to reject", () => {
    const fitted = fitToSchema({ ideas: [{ category: "not-a-category" }], followUpQuestion: null }, full);
    expect(IdeasResultSchema.safeParse(fitted).success).toBe(false);
  });
});
