"use client";

import { useState, type SubmitEvent } from "react";
import { formatDate } from "@/lib/domain/format";
import { delayTaskInPlan, setTaskStatus } from "@/lib/domain/plan";
import type { Task } from "@/lib/domain/schema";
import { blockedBy, nextActions, planningWindow, taskHealth, type TaskHealth } from "@/lib/domain/timeline";
import type { PanelProps } from "./PlanDashboard";
import { Section } from "./ui";

const HEALTH_LABEL: Record<TaskHealth, string | null> = {
  done: "Done",
  overdue: "Overdue",
  "due-soon": "Due this week",
  upcoming: null,
};

export function TimelinePanel({ plan, today, onChange, onUpdate }: PanelProps) {
  const planWindow = planningWindow(plan.brief.eventType, plan.brief.eventDate, today);
  const ready = new Set(nextActions(plan.tasks, plan.tasks.length).map((t) => t.id));
  const ordered = [...plan.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <Section
      id="timeline"
      title="Timeline"
      intro="Tasks are ordered by what has to happen first. Reschedule one and everything waiting on it moves too."
    >
      {planWindow.compressed && (
        <p className="callout warning">
          {planWindow.days} days left, against an ideal {planWindow.idealDays} for this kind of event, so the schedule
          is compressed. Start with the tasks marked Ready.
        </p>
      )}
      <ul className="task-list">
        {ordered.map((task) => (
          <TaskRow
            key={`${task.id}-${task.dueDate}`}
            task={task}
            health={taskHealth(task, today)}
            ready={ready.has(task.id)}
            waitingOn={blockedBy(task, plan.tasks)}
            today={today}
            eventDate={plan.brief.eventDate}
            onToggle={() => onChange(setTaskStatus(plan, task.id, task.status === "done" ? "todo" : "done"))}
            onReschedule={(date) => onUpdate(delayTaskInPlan(plan, task.id, date), "Schedule updated")}
          />
        ))}
      </ul>
    </Section>
  );
}

interface TaskRowProps {
  task: Task;
  health: TaskHealth;
  ready: boolean;
  waitingOn: Task[];
  today: string;
  eventDate: string;
  onToggle: () => void;
  onReschedule: (date: string) => void;
}

function TaskRow({ task, health, ready, waitingOn, today, eventDate, onToggle, onReschedule }: TaskRowProps) {
  const [date, setDate] = useState(task.dueDate);
  const status = HEALTH_LABEL[health];
  const id = `task-${task.id}`;

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (date && date !== task.dueDate) onReschedule(date);
  }

  return (
    <li className={`task ${health}`}>
      <div className="task-main">
        <input id={id} type="checkbox" checked={task.status === "done"} onChange={onToggle} />
        <label htmlFor={id}>{task.title}</label>
      </div>
      <p className="task-meta">
        Due {formatDate(task.dueDate)}
        {status && <span className={`badge ${health}`}>{status}</span>}
        {ready && task.status === "todo" && <span className="badge ok">Ready</span>}
        {task.priority === "high" && <span className="badge muted">High priority</span>}
      </p>
      {waitingOn.length > 0 && <p className="hint">Waiting on: {waitingOn.map((t) => t.title).join("; ")}</p>}
      {task.status === "todo" && (
        <details className="reschedule">
          <summary>Reschedule</summary>
          <form onSubmit={submit}>
            <label htmlFor={`${id}-date`}>New due date</label>
            <input
              id={`${id}-date`}
              type="date"
              min={today}
              max={eventDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button type="submit" className="button secondary small">
              Move it and update what depends on it
            </button>
          </form>
        </details>
      )}
    </li>
  );
}
