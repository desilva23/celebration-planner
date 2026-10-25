"use client";

import { useState } from "react";
import { daysBetween, todayIso } from "@/lib/domain/dates";
import { formatDate, formatInr } from "@/lib/domain/format";
import type { PlanUpdate } from "@/lib/domain/plan";
import type { Plan } from "@/lib/domain/schema";
import { summariseBudget } from "@/lib/domain/budget";
import { nextActions } from "@/lib/domain/timeline";
import { BudgetPanel } from "./BudgetPanel";
import { ChangePanel } from "./ChangePanel";
import { EffectsToast, type EffectsReport } from "./EffectsToast";
import { IdeasPanel } from "./IdeasPanel";
import { TimelinePanel } from "./TimelinePanel";
import { EVENT_TYPE_LABEL } from "./ui";
import { VendorPanel } from "./VendorPanel";

export interface PanelProps {
  plan: Plan;
  today: string;
  /** Save a plan change with no side effects worth reporting. */
  onChange: (plan: Plan) => void;
  /** Save a change and tell the user everything it moved. */
  onUpdate: (update: PlanUpdate, heading: string) => void;
}

export function PlanDashboard({ plan, onChange }: { plan: Plan; onChange: (plan: Plan) => void }) {
  const today = todayIso();
  const [report, setReport] = useState<EffectsReport | null>(null);

  const onUpdate = (update: PlanUpdate, heading: string) => {
    onChange(update.plan);
    setReport({ heading, items: update.effects });
  };
  const panel: PanelProps = { plan, today, onChange, onUpdate };

  const { brief } = plan;
  const summary = summariseBudget(plan.budget, brief);
  const daysLeft = daysBetween(today, brief.eventDate);
  const done = plan.tasks.filter((t) => t.status === "done").length;
  const upNext = nextActions(plan.tasks, 1)[0];

  return (
    <div className="dashboard">
      <section className="overview" aria-labelledby="overview-heading">
        <h1 id="overview-heading">{brief.title}</h1>
        <p className="meta">
          {EVENT_TYPE_LABEL[brief.eventType]} · {formatDate(brief.eventDate)} · {brief.guestCount} guests
          {brief.city && ` · ${brief.city}`}
        </p>
        <dl className="stats">
          <div>
            <dt>Days to go</dt>
            <dd>{daysLeft > 0 ? daysLeft : daysLeft === 0 ? "Today" : "Passed"}</dd>
          </div>
          <div>
            <dt>Planned spend</dt>
            <dd>
              {formatInr(summary.planned)} <small>of {formatInr(summary.budget)}</small>
            </dd>
          </div>
          <div>
            <dt>Tasks done</dt>
            <dd>
              {done} <small>of {plan.tasks.length}</small>
            </dd>
          </div>
        </dl>
        {summary.overBy > 0 && (
          <p className="callout warning">
            The plan is {formatInr(summary.overBy)} over budget. <a href="#budget">Choose a trade-off</a>.
          </p>
        )}
        {upNext && (
          <p className="next-up">
            <strong>Next up:</strong> {upNext.title}, due {formatDate(upNext.dueDate)}.{" "}
            <a href="#timeline">See the timeline</a>
          </p>
        )}
      </section>

      <nav className="section-nav" aria-label="Plan sections">
        <a href="#change">What changed?</a>
        <a href="#budget">Budget</a>
        <a href="#timeline">Timeline</a>
        <a href="#vendors">Vendors</a>
        <a href="#ideas">Ideas</a>
      </nav>

      <ChangePanel {...panel} />
      <BudgetPanel {...panel} />
      <TimelinePanel {...panel} />
      <VendorPanel {...panel} />
      <IdeasPanel plan={plan} />

      <EffectsToast report={report} onDismiss={() => setReport(null)} />
    </div>
  );
}
