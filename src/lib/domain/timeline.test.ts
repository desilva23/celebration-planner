import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { TODAY } from "./fixtures.test-helpers";
import type { CategoryId } from "./schema";
import { CATEGORIES } from "./schema";
import { buildTimeline, delayTask, nextActions, planningWindow } from "./timeline";

const ALL = new Set<CategoryId>(CATEGORIES);
const EVENT = "2027-03-01";

describe("buildTimeline", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  it("starts every task after its prerequisites are due", () => {
    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        expect(byId.get(dep)!.dueDate <= task.startDate, `${dep} before ${task.id}`).toBe(true);
      }
    }
  });

  it("keeps every task between today and the event", () => {
    for (const task of tasks) {
      expect(task.startDate >= TODAY).toBe(true);
      expect(task.dueDate <= EVENT).toBe(true);
      expect(task.startDate <= task.dueDate).toBe(true);
    }
  });

  it("compresses the schedule when the event is close", () => {
    const soon = addDays(TODAY, 20);
    expect(planningWindow("wedding", soon, TODAY).compressed).toBe(true);
    const squeezed = buildTimeline({ eventType: "wedding", eventDate: soon, today: TODAY, categories: ALL });
    expect(squeezed.every((t) => t.startDate >= TODAY && t.dueDate <= soon)).toBe(true);
  });

  it("skips tasks for categories the event doesn't have", () => {
    const noAttire = new Set<CategoryId>(CATEGORIES.filter((c) => c !== "attire"));
    const ids = buildTimeline({ eventType: "community", eventDate: EVENT, today: TODAY, categories: noAttire }).map(
      (t) => t.id,
    );
    expect(ids).not.toContain("attire");
  });
});

describe("delayTask", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });
  const venue = tasks.find((t) => t.id === "venue")!;

  it("pushes back everything that waits on the delayed task", () => {
    const { tasks: next, shifted } = delayTask(tasks, "venue", addDays(venue.dueDate, 45), EVENT);
    const moved = new Set(shifted.map((s) => s.id));
    expect(moved).toContain("venue");
    expect(moved).toContain("caterer");
    expect(moved).toContain("menu"); // two hops downstream
    const newVenueDue = next.find((t) => t.id === "venue")!.dueDate;
    for (const t of next.filter((t) => t.dependsOn.includes("venue"))) {
      expect(t.startDate >= newVenueDue).toBe(true);
    }
  });

  it("lets slack absorb a small slip instead of moving everything", () => {
    const { shifted } = delayTask(tasks, "venue", addDays(venue.dueDate, 20), EVENT);
    expect(shifted.map((s) => s.id)).not.toContain("menu");
  });

  it("never pushes a task past the event", () => {
    const { tasks: next } = delayTask(tasks, "venue", addDays(EVENT, 30), EVENT);
    expect(next.every((t) => t.dueDate <= EVENT)).toBe(true);
  });

  it("leaves finished tasks where they are", () => {
    const withDone = tasks.map((t) => (t.id === "caterer" ? { ...t, status: "done" as const } : t));
    const { tasks: next } = delayTask(withDone, "venue", addDays(venue.dueDate, 20), EVENT);
    expect(next.find((t) => t.id === "caterer")).toEqual(withDone.find((t) => t.id === "caterer"));
  });
});

describe("nextActions", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });

  it("only suggests tasks whose prerequisites are done", () => {
    expect(nextActions(tasks).map((t) => t.id)).toEqual(["budget", "attire"]);
    const afterBudget = tasks.map((t) => (t.id === "budget" ? { ...t, status: "done" as const } : t));
    expect(nextActions(afterBudget).map((t) => t.id)).toContain("guests-draft");
  });
});
