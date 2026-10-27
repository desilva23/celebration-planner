import { describe, expect, it } from "vitest";
import { RunSheetRequestSchema, runSheetResultFor } from "./contracts";
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
