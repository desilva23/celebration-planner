import { describe, expect, it } from "vitest";
import { calendarFile } from "./calendar";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { createPlan, setTaskStatus } from "./plan";
import { addPayment, bookVendor, upsertVendor } from "./vendors";
import type { Plan } from "./schema";

const NOW = new Date("2026-10-25T06:30:00.000Z");

function plan(): Plan {
  let p = createPlan(weddingBrief({ title: "Anu & Ravi's wedding, Chennai; 2027" }), TODAY, NOW);
  p = setTaskStatus(p, "budget", "done", NOW);
  p = upsertVendor(p, {
    id: "v1",
    category: "venue",
    name: "Lotus Hall",
    contact: "",
    quote: 150_000,
    status: "quoted",
    notes: "",
    payments: [],
  });
  p = bookVendor(p, "v1", NOW).plan;
  p = addPayment(p, "v1", { id: "a", label: "Advance", amount: 50_000, dueDate: "2026-11-15", paid: false }, NOW).plan;
  p = addPayment(p, "v1", { id: "b", label: "Paid already", amount: 1, dueDate: "2026-10-20", paid: true }, NOW).plan;
  return p;
}

/** Undoes line folding, then splits into lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("calendarFile", () => {
  const ics = calendarFile(plan(), NOW);
  const lines = unfold(ics);
  const events = ics.split("BEGIN:VEVENT").slice(1);

  it("is a well-formed calendar with CRLF line endings", () => {
    expect(lines.slice(0, 4)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Celebration Planner//EN",
      "CALSCALE:GREGORIAN",
    ]);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("has the event day, every open task, and every unpaid payment, as all-day events", () => {
    const summaries = lines.filter((l) => l.startsWith("SUMMARY:"));
    expect(summaries[0]).toBe("SUMMARY:Anu & Ravi's wedding\\, Chennai\\; 2027");
    expect(summaries).toContain("SUMMARY:Due: Draft the guest list");
    expect(summaries).not.toContain("SUMMARY:Due: Agree the total budget and what matters most");
    expect(summaries).not.toContain("SUMMARY:Due: Shortlist and book the venue");
    expect(summaries).toContain("SUMMARY:Pay Lotus Hall: Advance\\, ₹50\\,000");
    expect(summaries.some((s) => s.includes("Paid already"))).toBe(false);
    expect(events).toHaveLength(1 + 12 + 1);
    expect(events[0]).toContain("DTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270302");
  });

  it("stamps events and gives each a stable id per plan", () => {
    expect(lines).toContain("DTSTAMP:20261025T063000Z");
    expect(lines).toContain("UID:event-day-20261025063000000@celebration-planner");
    expect(lines).toContain("UID:payment-v1-a-20261025063000000@celebration-planner");
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
    expect(calendarFile(plan(), NOW)).toBe(ics);
  });

  it("escapes backslashes and newlines in text", () => {
    const p = plan();
    const odd = calendarFile({ ...p, brief: { ...p.brief, title: "A\\B\nC" } }, NOW);
    expect(unfold(odd)).toContain("X-WR-CALNAME:A\\\\B\\nC");
  });

  it("folds long lines at 75 bytes without splitting a character", () => {
    const p = plan();
    const long = calendarFile({ ...p, brief: { ...p.brief, title: "₹".repeat(60) } }, NOW);
    const encoder = new TextEncoder();
    for (const line of long.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(long)).toContain(`SUMMARY:${"₹".repeat(60)}`);
  });

  it("fills each folded line to exactly 75 bytes, counting the continuation space", () => {
    const p = plan();
    const folded = calendarFile({ ...p, brief: { ...p.brief, title: "a".repeat(200) } }, NOW).split("\r\n");
    const start = folded.findIndex((l) => l.startsWith("SUMMARY:a"));
    // "SUMMARY:" and 200 letters is 208 bytes: 75, then a space and 74, then a space and the last 59.
    expect(folded.slice(start, start + 3).map((l) => l.length)).toEqual([75, 75, 60]);
    expect(folded[start + 1]).toMatch(/^ a+$/);
  });

  it("closes every event it opens, and ids each task by its kind", () => {
    expect(ics.match(/^END:VEVENT$/gm)?.length).toBe(events.length);
    expect(lines.filter((l) => l.startsWith("UID:task-")).length).toBeGreaterThan(0);
  });

  it("uses the current time when none is given", () => {
    expect(calendarFile(plan())).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
});
