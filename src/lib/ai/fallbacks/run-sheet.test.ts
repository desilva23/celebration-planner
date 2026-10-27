import { describe, expect, it } from "vitest";
import { weddingBrief } from "../../domain/fixtures.test-helpers";
import { runSheetResultFor } from "../contracts";
import { runSheetFallback } from "./run-sheet";

describe("runSheetFallback", () => {
  const request = { brief: weddingBrief(), startTime: "18:00", vendors: [] };

  it("times each step around guest arrival", () => {
    const { items } = runSheetFallback(request);
    expect(items.map((i) => i.time)).toEqual([
      "15:00",
      "15:30",
      "16:00",
      "17:00",
      "17:30",
      "18:00",
      "19:00",
      "20:00",
      "22:00",
      "22:30",
    ]);
    expect(items[5]).toMatchObject({ title: "Guests arrive", who: "Hosts" });
  });

  it("names a booked vendor for their own steps, and a role for everything else", () => {
    const { items } = runSheetFallback({
      ...request,
      vendors: [
        { category: "catering", name: "Annapoorna" },
        { category: "venue", name: "Lotus Hall" },
      ],
    });
    expect(items.filter((i) => i.who === "Annapoorna").map((i) => i.title)).toEqual([
      "Catering setup",
      "Food is served",
    ]);
    expect(items[0]!.who).toBe("Lotus Hall");
    expect(items.find((i) => i.title === "Decor finishing touches")!.who).toBe("Hosts");
  });

  it("wraps past midnight for late functions", () => {
    const { items } = runSheetFallback({ ...request, startTime: "22:30" });
    expect([items[0]!.time, items.at(-1)!.time]).toEqual(["19:30", "03:00"]);
  });

  it.each([
    ["wedding", "Ceremony"],
    ["birthday", "Cake cutting"],
    ["anniversary", "Toasts and a few words from the family"],
    ["community", "Main programme"],
    ["other", "Main programme"],
  ] as const)("centres a %s on its main moment", (eventType, moment) => {
    expect(runSheetFallback({ ...request, brief: weddingBrief({ eventType }) }).items[6]!.title).toBe(moment);
  });

  it("answers within the same contract the AI is held to, naming no one else", () => {
    const vendors = [{ category: "photography" as const, name: "Lens & Light" }];
    const schema = runSheetResultFor(vendors.map((v) => v.name));
    expect(schema.safeParse(runSheetFallback({ ...request, vendors })).success).toBe(true);
  });
});
