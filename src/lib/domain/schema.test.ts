import { describe, expect, it } from "vitest";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { createPlan, PlanError } from "./plan";
import { upsertVendor } from "./vendors";
import { EventBriefSchema, PlanSchema, type Vendor } from "./schema";

const vendor: Vendor = {
  id: "v1",
  category: "venue",
  name: "Lotus Hall",
  contact: "",
  quote: null,
  status: "considering",
  notes: "",
  payments: [],
};

describe("schemas", () => {
  it("trim the text people type about the event", () => {
    const brief = { ...weddingBrief(), title: "  Anu & Ravi  ", city: " Chennai ", notes: "  vegetarian  " };
    expect(EventBriefSchema.parse(brief)).toMatchObject({ title: "Anu & Ravi", city: "Chennai", notes: "vegetarian" });
  });

  it("trim what's recorded about a vendor", () => {
    const padded = { ...vendor, name: " Lotus Hall ", contact: " 98400 00000 ", notes: " ground floor " };
    const plan = { ...createPlan(weddingBrief(), TODAY), vendors: [padded] };
    expect(PlanSchema.parse(plan).vendors[0]).toMatchObject({
      name: "Lotus Hall",
      contact: "98400 00000",
      notes: "ground floor",
    });
  });

  it("refuse a name that's only spaces", () => {
    expect(EventBriefSchema.safeParse({ ...weddingBrief(), title: "   " }).success).toBe(false);
    expect(() => upsertVendor(createPlan(weddingBrief(), TODAY), { ...vendor, name: "   " })).toThrow(PlanError);
  });
});
