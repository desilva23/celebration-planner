import { describe, expect, it } from "vitest";
import { z } from "../zod";
import {
  CompareQuotesRequestSchema,
  CompareQuotesResultSchema,
  GeneratedIdeasSchema,
  IdeasRequestSchema,
  IdeasResultSchema,
  InterpretRequestSchema,
  InterpretResultSchema,
  RunSheetRequestSchema,
  RunSheetResultSchema,
  runSheetResultFor,
  VendorBriefRequestSchema,
  VendorBriefResultSchema,
} from "./contracts";
import { responseSchemas } from "./json-schema";
import { weddingBrief } from "../domain/fixtures.test-helpers";

const sheet = (who: string, time = "18:00") => ({
  items: [
    { time, title: "Guests arrive", details: "", who },
    { time: "19:00", title: "Ceremony", details: "", who: "Family" },
    { time: "20:00", title: "Dinner", details: "", who: "Hosts" },
  ],
  reminders: [],
});

describe("runSheetResultFor", () => {
  const schema = runSheetResultFor(["Lotus Hall", "Annapoorna"]);

  it("lets steps go to booked vendors or the generic roles", () => {
    for (const who of ["Lotus Hall", "Annapoorna", "Hosts", "Family", "Venue staff", "Everyone"]) {
      expect(schema.safeParse(sheet(who)).success, who).toBe(true);
    }
  });

  it("refuses anyone else, so the model can't invent a vendor", () => {
    expect(schema.safeParse(sheet("Grand Events Pvt Ltd")).success).toBe(false);
  });

  it("sends the allowed names to the model as a closed list", () => {
    const { portable } = responseSchemas(schema);
    expect(JSON.stringify(portable)).toContain(
      '"enum":["Hosts","Family","Venue staff","Everyone","Lotus Hall","Annapoorna"]',
    );
  });

  it("lists a vendor named like a role only once", () => {
    const { portable } = responseSchemas(runSheetResultFor(["Family"]));
    expect(JSON.stringify(portable)).toContain('"enum":["Hosts","Family","Venue staff","Everyone"]');
  });

  it.each(["24:00", "7:30", "18:60", "6pm"])("refuses %s as a time", (time) => {
    expect(schema.safeParse(sheet("Hosts", time)).success).toBe(false);
  });
});

describe("RunSheetRequestSchema", () => {
  it("needs a valid start time and at most 20 named vendors", () => {
    const request = { brief: weddingBrief(), startTime: "18:30", vendors: [{ category: "venue", name: "Lotus Hall" }] };
    expect(RunSheetRequestSchema.safeParse(request).success).toBe(true);
    expect(RunSheetRequestSchema.safeParse({ ...request, startTime: "25:00" }).error?.issues[0]?.message).toBe(
      "Use a 24-hour time like 18:30",
    );
    expect(RunSheetRequestSchema.safeParse({ ...request, vendors: [{ category: "venue", name: " " }] }).success).toBe(
      false,
    );
  });
});

/** Every length, count, range and pattern limit in a schema, one line per field. */
function limits(schema: unknown, path = ""): string[] {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  // A named format (such as Zod's ISO date) stands in for its long built-in pattern.
  const keys = ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "format"];
  if (!("format" in node)) keys.push("pattern");
  const own = keys.filter((key) => key in node).map((key) => `${key} ${String(node[key])}`);
  const properties = Object.entries((node.properties ?? {}) as Record<string, unknown>);
  return [
    ...(own.length ? [`${path || "(root)"}: ${own.join(", ")}`] : []),
    ...properties.flatMap(([key, value]) => limits(value, path ? `${path}.${key}` : key)),
    ...limits(node.items, `${path}[]`),
    ...((node.anyOf ?? []) as unknown[]).flatMap((option) => limits(option, path)),
  ];
}

describe("contract limits", () => {
  // The limits bound what clients may send and what the model may answer, so
  // any change to them should be deliberate and show up in review.
  it.each([
    ["InterpretRequest", InterpretRequestSchema],
    ["InterpretResult", InterpretResultSchema],
    ["IdeasRequest", IdeasRequestSchema],
    ["GeneratedIdeas", GeneratedIdeasSchema],
    ["IdeasResult", IdeasResultSchema],
    ["VendorBriefRequest", VendorBriefRequestSchema],
    ["VendorBriefResult", VendorBriefResultSchema],
    ["CompareQuotesRequest", CompareQuotesRequestSchema],
    ["CompareQuotesResult", CompareQuotesResultSchema],
    ["RunSheetRequest", RunSheetRequestSchema],
    ["RunSheetResult", RunSheetResultSchema],
  ] as const)("%s", (_, schema) => {
    expect(limits(z.toJSONSchema(schema, { io: "input" }))).toMatchSnapshot();
  });

  it("trims what people type before checking it", () => {
    expect(InterpretRequestSchema.safeParse({ message: "   ", brief: null, today: "2026-10-25" }).success).toBe(false);
    const quote = { label: " Annapoorna ", text: "  Per plate ₹900, minimum 150 guests.  " };
    const request = { category: "catering", guestCount: 200, budgetForCategory: 200_000, quotes: [quote] };
    expect(CompareQuotesRequestSchema.parse(request).quotes[0]).toEqual({
      label: "Annapoorna",
      text: "Per plate ₹900, minimum 150 guests.",
    });
    const blankLabel = { ...request, quotes: [{ ...quote, label: "  " }] };
    expect(CompareQuotesRequestSchema.safeParse(blankLabel).success).toBe(false);
    const ideas = { brief: weddingBrief(), budget: [], refinement: "  too expensive  " };
    expect(IdeasRequestSchema.parse(ideas).refinement).toBe("too expensive");
  });

  it.each(["x18:00", "18:00x"])("refuses %s, a time with anything around it", (time) => {
    expect(runSheetResultFor([]).safeParse(sheet("Hosts", time)).success).toBe(false);
  });
});
