import { describe, expect, it } from "vitest";
import { z } from "../zod";
import {
  CompareQuotesResultSchema,
  GeneratedIdeasSchema,
  IdeasResultSchema,
  InterpretResultSchema,
  runSheetResultFor,
  VendorBriefResultSchema,
} from "./contracts";
import { fitToSchema, responseSchemas } from "./json-schema";

interface Prop {
  description?: string;
  anyOf?: { description?: string }[];
  properties?: Record<string, Prop>;
}

/** One property of an object schema; fails the test if it is missing. */
function prop(node: { properties?: unknown }, name: string): Prop {
  const found = (node.properties as Record<string, Prop> | undefined)?.[name];
  if (!found) throw new Error(`No property "${name}" in the schema`);
  return found;
}

const LIMIT_KEYS = [
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "maxItems",
  "minItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
];

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
    ["vendor brief", VendorBriefResultSchema],
    ["quotes", CompareQuotesResultSchema],
    ["run sheet", runSheetResultFor(["Lotus Hall"])],
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
    expect(prop(portable, "understood").description).toMatch(/at most 300 characters/);
  });

  it("turns dates, item counts and numeric bounds into hints", () => {
    const updates = prop(responseSchemas(InterpretResultSchema).portable, "updates");
    expect(prop(updates, "eventDate").anyOf?.[0]?.description).toBe("a date as YYYY-MM-DD");
    expect(prop(updates, "guestCount").anyOf?.[0]?.description).toBe("minimum 1; maximum 5000");
    expect(prop(responseSchemas(GeneratedIdeasSchema).portable, "ideas").description).toBe(
      "at least 1 items; at most 4 items",
    );
  });

  it("adds hints after an existing description, and skips Zod's default integer bounds", () => {
    const { portable } = responseSchemas(
      z.object({ total: z.string().max(5).describe("The total"), count: z.number().int() }),
    );
    expect(prop(portable, "total").description).toBe("The total; at most 5 characters");
    expect(prop(portable, "count").description).toBeUndefined();
  });

  it("strips every kind of limit, including ones the contracts don't use yet", () => {
    const schema = z.object({
      name: z.string().min(1).regex(/^a/),
      score: z.number().gt(0).lt(10),
      on: z.iso.date(),
      tags: z.array(z.string()).min(2),
    });
    const keys = keysIn(responseSchemas(schema).portable);
    for (const k of LIMIT_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("only hints at a minimum number of items when there is one", () => {
    const { portable } = responseSchemas(z.object({ tags: z.array(z.string()).min(0) }));
    expect(prop(portable, "tags").description).toBeUndefined();
  });

  it("treats bounds of a trillion or more as Zod's defaults, not real limits", () => {
    const { portable } = responseSchemas(z.object({ big: z.number().max(1e12), almost: z.number().max(1e12 - 1) }));
    expect(prop(portable, "big").description).toBeUndefined();
    expect(prop(portable, "almost").description).toBe("maximum 999999999999");
  });

  it("explains a time format the model can't be sent as a pattern", () => {
    const { portable } = responseSchemas(runSheetResultFor([]));
    expect(JSON.stringify(portable)).toContain('"description":"24-hour time as HH:MM"');
    expect(JSON.stringify(portable)).not.toContain("pattern");
  });

  // Regression: field names under `properties` used to be stripped like keywords.
  it("keeps fields whose names look like schema keywords", () => {
    const { portable } = responseSchemas(
      z.object({ format: z.string(), pattern: z.string().max(10), minimum: z.number() }),
    );
    expect(Object.keys(portable.properties as object)).toEqual(["format", "pattern", "minimum"]);
    expect(portable.required).toEqual(["format", "pattern", "minimum"]);
    expect(prop(portable, "pattern").description).toBe("at most 10 characters");
  });
});

describe("fitToSchema", () => {
  const { full } = responseSchemas(GeneratedIdeasSchema);

  it("trims over-long replies so they validate", () => {
    const idea = {
      title: "T".repeat(200),
      summary: "s",
      whyItFits: "w",
      details: Array(10).fill("d"),
      category: "decor",
      costBreakdown: [{ item: "Flowers", min: 1000.4, max: 2000.6 }],
      assumptions: [],
    };
    const fitted = fitToSchema({ ideas: [idea, idea, idea, idea, idea], followUpQuestion: null }, full);
    const parsed = GeneratedIdeasSchema.parse(fitted);
    expect(parsed.ideas).toHaveLength(4);
    expect(parsed.ideas[0]!.title.length).toBeLessThanOrEqual(80);
    expect(parsed.ideas[0]!.details).toHaveLength(6);
    expect(parsed.ideas[0]!.costBreakdown[0]).toMatchObject({ min: 1000, max: 2001 });
  });

  it("leaves genuinely wrong replies for validation to reject", () => {
    const fitted = fitToSchema({ ideas: [{ category: "not-a-category" }], followUpQuestion: null }, full);
    expect(IdeasResultSchema.safeParse(fitted).success).toBe(false);
  });

  it("keeps nulls in nullable fields and fits the value otherwise", () => {
    const nullable = { anyOf: [{ type: "string", maxLength: 3 }, { type: "null" }] };
    expect(fitToSchema(null, nullable)).toBeNull();
    expect(fitToSchema("abcdef", nullable)).toBe("ab…");
    expect(fitToSchema("x", { anyOf: [{ type: "null" }] })).toBe("x");
  });

  it("cuts at the end of a word, without a space before the ellipsis", () => {
    expect(fitToSchema("hello world", { type: "string", maxLength: 7 })).toBe("hello…");
  });

  it("fits a nullable field whichever order its options come in", () => {
    expect(fitToSchema("abcdef", { anyOf: [{ type: "null" }, { type: "string", maxLength: 3 }] })).toBe("ab…");
  });

  it("rounds integers but not other numbers", () => {
    expect(fitToSchema(2.5, { type: "number" })).toBe(2.5);
  });

  it("leaves short strings, unlimited arrays and untyped items alone", () => {
    expect(fitToSchema("abc", { type: "string", maxLength: 3 })).toBe("abc");
    expect(fitToSchema("abcdef", { type: "string" })).toBe("abcdef");
    expect(fitToSchema([1.4, 2.6], { type: "array", items: { type: "integer" } })).toEqual([1, 3]);
    expect(fitToSchema([1.5, "x"], { type: "array", maxItems: 1 })).toEqual([1.5]);
  });

  it("passes through fields the schema doesn't describe, and values of the wrong shape", () => {
    expect(
      fitToSchema({ known: 1.6, extra: 2.4 }, { type: "object", properties: { known: { type: "integer" } } }),
    ).toEqual({
      known: 2,
      extra: 2.4,
    });
    expect(fitToSchema({ a: 1.5 }, { type: "object" })).toEqual({ a: 1.5 });
    expect(fitToSchema([1], { type: "object", properties: {} })).toEqual([1]);
    expect(fitToSchema(7, { type: "string", maxLength: 1 })).toBe(7);
    expect(fitToSchema(null, { type: "object" })).toBeNull();
    expect(fitToSchema("abc", { type: "object", properties: {} })).toBe("abc");
  });
});
