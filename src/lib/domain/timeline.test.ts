import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { TODAY } from "./fixtures.test-helpers";
import type { CategoryId, Task } from "./schema";
import { CATEGORIES } from "./schema";
import {
  blockedBy,
  buildTimeline,
  delayTask,
  nextActions,
  planningWindow,
  rescheduleOpenTasks,
  taskHealth,
} from "./timeline";

const ALL = new Set<CategoryId>(CATEGORIES);
const EVENT = "2027-03-01";

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: id,
  category: "planning",
  dependsOn: [],
  startDate: TODAY,
  dueDate: "2027-01-01",
  status: "todo",
  priority: "medium",
  ...overrides,
});

describe("planningWindow", () => {
  it("uses the ideal horizon when there is time, and flags a squeeze when there isn't", () => {
    expect(planningWindow("wedding", EVENT, TODAY)).toEqual({ days: 120, idealDays: 120, compressed: false });
    expect(planningWindow("birthday", addDays(TODAY, 10), TODAY)).toEqual({
      days: 10,
      idealDays: 30,
      compressed: true,
    });
  });

  it("only counts as squeezed with less than the ideal time left", () => {
    expect(planningWindow("birthday", addDays(TODAY, 30), TODAY).compressed).toBe(false);
    expect(planningWindow("birthday", addDays(TODAY, 29), TODAY).compressed).toBe(true);
  });

  it("still gives a one-day window once the event date has passed", () => {
    expect(planningWindow("wedding", addDays(TODAY, -3), TODAY)).toMatchObject({ days: 1, compressed: true });
  });
});

describe("buildTimeline", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  it("orders the tasks by what each one needs done first", () => {
    expect(Object.fromEntries(tasks.map((t) => [t.id, t.dependsOn]))).toEqual({
      budget: [],
      "guests-draft": ["budget"],
      venue: ["guests-draft"],
      caterer: ["venue"],
      photographer: ["venue"],
      decor: ["venue"],
      entertainment: ["venue"],
      "guests-final": ["guests-draft"],
      invitations: ["venue", "guests-final"],
      attire: [],
      menu: ["caterer", "guests-final"],
      transport: ["venue", "guests-final"],
      confirm: ["caterer", "photographer", "decor"],
      "run-sheet": ["confirm"],
    });
  });

  it("drops dependencies on tasks the plan doesn't have", () => {
    const withoutVenue = new Set(CATEGORIES.filter((c) => c !== "venue"));
    const plan = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: withoutVenue });
    const deps = new Map(plan.map((t) => [t.id, t.dependsOn]));
    expect(deps.has("venue")).toBe(false);
    expect([deps.get("caterer"), deps.get("invitations")]).toEqual([[], ["guests-final"]]);
  });

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

  it("ignores prerequisites that are already done", () => {
    const list = [
      task("a", { status: "done", dueDate: "2027-02-01" }),
      task("b", { dependsOn: ["a"], startDate: "2027-01-01", dueDate: "2027-01-10" }),
      task("c", { dueDate: "2027-01-05" }),
    ];
    expect(delayTask(list, "c", "2027-01-06", EVENT).shifted.map((s) => s.id)).toEqual(["c"]);
  });

  it("pulls the start in when a task is brought forward", () => {
    const earlier = addDays(venue.startDate, -5);
    const moved = delayTask(tasks, "venue", earlier, EVENT).tasks.find((t) => t.id === "venue");
    expect(moved).toMatchObject({ startDate: earlier, dueDate: earlier });
  });

  it("records nothing when the date doesn't change", () => {
    expect(delayTask(tasks, "venue", venue.dueDate, EVENT).shifted).toEqual([]);
  });

  it("refuses a task that isn't in the plan", () => {
    expect(() => delayTask(tasks, "nope", EVENT, EVENT)).toThrow("Unknown task: nope");
  });

  it("returns new tasks instead of editing the ones it was given", () => {
    const snapshot = structuredClone(tasks);
    delayTask(tasks, "venue", addDays(venue.dueDate, 45), EVENT);
    expect(tasks).toEqual(snapshot);
  });
});

describe("rescheduleOpenTasks", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });

  it("moves open tasks onto the new date's schedule and leaves finished ones alone", () => {
    const withDone = tasks.map((t) => (t.id === "budget" ? { ...t, status: "done" as const } : t));
    const earlier = addDays(EVENT, -14);
    const fresh = new Map(
      buildTimeline({ eventType: "wedding", eventDate: earlier, today: TODAY, categories: ALL }).map((t) => [t.id, t]),
    );
    for (const t of rescheduleOpenTasks(withDone, "wedding", earlier, TODAY)) {
      if (t.id === "budget") expect(t).toEqual(withDone[0]);
      else expect(t).toMatchObject({ startDate: fresh.get(t.id)!.startDate, dueDate: fresh.get(t.id)!.dueDate });
    }
  });

  it("leaves tasks that didn't come from a template alone", () => {
    const custom = task("custom");
    expect(rescheduleOpenTasks([custom], "wedding", EVENT, TODAY)).toEqual([custom]);
  });
});

describe("taskHealth", () => {
  it.each([
    [{ status: "done" as const, dueDate: "2026-10-01" }, "done"],
    [{ dueDate: "2026-10-24" }, "overdue"],
    [{ dueDate: TODAY }, "due-soon"],
    [{ dueDate: "2026-11-01" }, "due-soon"],
    [{ dueDate: "2026-11-02" }, "upcoming"],
  ])("%o is %s", (overrides, health) => {
    expect(taskHealth(task("t", overrides), TODAY)).toBe(health);
  });
});

describe("nextActions", () => {
  const tasks = buildTimeline({ eventType: "wedding", eventDate: EVENT, today: TODAY, categories: ALL });

  it("only suggests tasks whose prerequisites are done", () => {
    expect(nextActions(tasks).map((t) => t.id)).toEqual(["budget", "attire"]);
    const afterBudget = tasks.map((t) => (t.id === "budget" ? { ...t, status: "done" as const } : t));
    expect(nextActions(afterBudget).map((t) => t.id)).toContain("guests-draft");
  });

  it("puts the soonest first, breaks ties by priority, and stops at the limit", () => {
    const list = [
      task("low", { priority: "low" }),
      task("high", { priority: "high" }),
      task("soon", { dueDate: "2026-12-01" }),
    ];
    expect(nextActions(list).map((t) => t.id)).toEqual(["soon", "high", "low"]);
    expect(nextActions(list, 1).map((t) => t.id)).toEqual(["soon"]);
  });
});

describe("blockedBy", () => {
  it("lists only the prerequisites that are still open", () => {
    const list = [task("a"), task("b", { status: "done" }), task("c", { dependsOn: ["a", "b", "gone"] })];
    expect(blockedBy(list[2]!, list).map((t) => t.id)).toEqual(["a"]);
  });
});
