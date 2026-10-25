import { PLANNING_HORIZON_DAYS, TASK_TEMPLATES } from "./assumptions";
import { addDays, daysBetween, earlierOf, laterOf } from "./dates";
import type { CategoryId, EventType, Task } from "./schema";

export interface PlanningWindow {
  days: number;
  idealDays: number;
  /** Less time is left than the event type ideally needs. */
  compressed: boolean;
}

export function planningWindow(eventType: EventType, eventDate: string, today: string): PlanningWindow {
  const idealDays = PLANNING_HORIZON_DAYS[eventType];
  const left = daysBetween(today, eventDate);
  return { days: Math.max(1, Math.min(idealDays, left)), idealDays, compressed: left < idealDays };
}

export interface TimelineInput {
  eventType: EventType;
  eventDate: string;
  today: string;
  /** Only tasks for categories in the budget are included. */
  categories: ReadonlySet<CategoryId>;
}

/**
 * Lays the task templates out backwards from the event date. When less time is
 * left than ideal, every task is squeezed proportionally into what remains.
 */
export function buildTimeline({ eventType, eventDate, today, categories }: TimelineInput): Task[] {
  const { days } = planningWindow(eventType, eventDate, today);
  const included = TASK_TEMPLATES.filter((t) => t.category === "planning" || categories.has(t.category));
  const ids = new Set(included.map((t) => t.id));

  return included.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    dependsOn: t.dependsOn.filter((id) => ids.has(id)),
    startDate: addDays(eventDate, -Math.min(days, Math.round((t.due + t.span) * days))),
    dueDate: addDays(eventDate, -Math.round(t.due * days)),
    status: "todo",
    priority: t.priority,
  }));
}

const ALL_TEMPLATE_CATEGORIES = new Set(TASK_TEMPLATES.flatMap((t) => (t.category === "planning" ? [] : [t.category])));

/** Re-plans open tasks against a new event date. Finished tasks keep their dates. */
export function rescheduleOpenTasks(tasks: Task[], eventType: EventType, eventDate: string, today: string): Task[] {
  const fresh = new Map(
    buildTimeline({ eventType, eventDate, today, categories: ALL_TEMPLATE_CATEGORIES }).map((t) => [t.id, t]),
  );
  return tasks.map((task) => {
    const next = fresh.get(task.id);
    if (task.status === "done" || !next) return task;
    return { ...task, startDate: next.startDate, dueDate: next.dueDate };
  });
}

export interface DateShift {
  id: string;
  title: string;
  from: string;
  to: string;
}

/**
 * Moves one task's deadline and pushes back every open task that can't start
 * until it is done. Nothing is pushed past the event date.
 */
export function delayTask(
  tasks: Task[],
  taskId: string,
  newDueDate: string,
  eventDate: string,
): { tasks: Task[]; shifted: DateShift[] } {
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));
  const target = byId.get(taskId);
  if (!target) throw new Error(`Unknown task: ${taskId}`);

  const shifted: DateShift[] = [];
  const original = target.dueDate;
  target.dueDate = earlierOf(newDueDate, eventDate);
  target.startDate = earlierOf(target.startDate, target.dueDate);
  if (target.dueDate !== original) {
    shifted.push({ id: target.id, title: target.title, from: original, to: target.dueDate });
  }

  // Tasks are stored with dependencies first, so one pass reaches every
  // downstream task after its blockers have already moved.
  for (const task of tasks) {
    const current = byId.get(task.id)!;
    if (current.id === taskId || current.status === "done") continue;
    const readyFrom = current.dependsOn
      .map((id) => byId.get(id))
      .filter((dep): dep is Task => dep !== undefined && dep.status === "todo")
      .reduce((date, dep) => laterOf(date, dep.dueDate), current.startDate);
    if (readyFrom === current.startDate) continue;

    const duration = daysBetween(current.startDate, current.dueDate);
    current.startDate = readyFrom;
    current.dueDate = earlierOf(addDays(readyFrom, duration), eventDate);
    shifted.push({ id: current.id, title: current.title, from: task.dueDate, to: current.dueDate });
  }

  return { tasks: tasks.map((t) => byId.get(t.id)!), shifted };
}

export type TaskHealth = "done" | "overdue" | "due-soon" | "upcoming";

export function taskHealth(task: Task, today: string): TaskHealth {
  if (task.status === "done") return "done";
  if (task.dueDate < today) return "overdue";
  if (daysBetween(today, task.dueDate) <= 7) return "due-soon";
  return "upcoming";
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Open tasks whose prerequisites are all done: what the user can act on now. */
export function nextActions(tasks: Task[], limit = 3): Task[] {
  const done = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
  return tasks
    .filter((t) => t.status === "todo" && t.dependsOn.every((id) => done.has(id)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, limit);
}

/** Open tasks still waiting on something else. */
export function blockedBy(task: Task, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter((dep): dep is Task => dep !== undefined && dep.status === "todo");
}
