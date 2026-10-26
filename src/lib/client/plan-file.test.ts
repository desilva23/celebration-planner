import { describe, expect, it, vi } from "vitest";
import { captureDownloads } from "@/test/downloads";
import { vendor, weddingPlan } from "@/test/plan";
import { downloadFile, parsePlan } from "./plan-file";

describe("parsePlan", () => {
  it("reads a plan back from its JSON", () => {
    const plan = weddingPlan();
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
  });

  it("opens plans saved before the guest list existed", () => {
    const plan = weddingPlan();
    const saved = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
    delete saved.guests;
    expect(parsePlan(JSON.stringify(saved))).toEqual(plan);
  });

  it("opens plans saved before vendors had payments", () => {
    const plan = { ...weddingPlan(), vendors: [vendor({ quote: 150_000, status: "quoted" })] };
    const saved = JSON.parse(JSON.stringify(plan)) as { vendors: Record<string, unknown>[] };
    delete saved.vendors[0]!.payments;
    expect(parsePlan(JSON.stringify(saved))).toEqual(plan);
  });

  it.each([
    ["isn't JSON", "{not json"],
    ["is empty", ""],
    ["isn't a plan this version understands", JSON.stringify({ ...weddingPlan(), version: 2 })],
  ])("returns null for text that %s", (_, text) => {
    expect(parsePlan(text)).toBeNull();
  });
});

describe("downloadFile", () => {
  it("saves the text under the given name, then releases the memory", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const files = captureDownloads();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    downloadFile("plan.json", '{"a":1}');

    expect(files.map((f) => f.name)).toEqual(["plan.json"]);
    expect(await files[0]!.blob.text()).toBe('{"a":1}');
    expect(files[0]!.blob.type).toBe("application/json");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:test/0");
  });

  it("can save other kinds of file", () => {
    const files = captureDownloads();
    downloadFile("deadlines.ics", "BEGIN:VCALENDAR", "text/calendar");
    expect(files[0]!.blob.type).toBe("text/calendar");
  });
});
