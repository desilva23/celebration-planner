"use client";

import { useState } from "react";
import { summariseBudget } from "@/lib/domain/budget";
import { daysBetween, todayIso } from "@/lib/domain/dates";
import { formatDate, formatInr } from "@/lib/domain/format";
import { summarisePayments, type DuePayment } from "@/lib/domain/payments";
import type { PlanUpdate } from "@/lib/domain/plan";
import type { Plan } from "@/lib/domain/schema";
import { nextActions } from "@/lib/domain/timeline";
import { BudgetPanel } from "./BudgetPanel";
import { ChangePanel } from "./ChangePanel";
import { EffectsToast, type EffectsReport } from "./EffectsToast";
import { GuestsPanel } from "./GuestsPanel";
import { IdeasPanel } from "./IdeasPanel";
import { PlanSharing } from "./PlanSharing";
import { RunSheetPanel } from "./RunSheetPanel";
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

interface UndoableReport extends EffectsReport {
  /** The plan before and after the reported change. */
  change?: { before: Plan; after: Plan };
}

export function PlanDashboard({ plan, onChange }: { plan: Plan; onChange: (plan: Plan) => void }) {
  const today = todayIso();
  const [report, setReport] = useState<UndoableReport | null>(null);

  const onUpdate = (update: PlanUpdate, heading: string) => {
    onChange(update.plan);
    setReport({ heading, items: update.effects, change: { before: plan, after: update.plan } });
  };
  const panel: PanelProps = { plan, today, onChange, onUpdate };

  // Undo is offered only while the plan is still the one the change produced,
  // so it can never silently throw away something done since.
  const undo = report?.change?.after === plan ? { before: report.change.before, heading: report.heading } : null;

  return (
    <div className="dashboard">
      <Overview plan={plan} today={today} />
      <SectionNav />

      <ChangePanel {...panel} />
      <BudgetPanel {...panel} />
      <TimelinePanel {...panel} />
      <RunSheetPanel plan={plan} />
      <VendorPanel {...panel} />
      <GuestsPanel {...panel} />
      <IdeasPanel plan={plan} />

      <EffectsToast
        report={report}
        onDismiss={() => setReport(null)}
        onUndo={
          undo
            ? () => {
                onChange(undo.before);
                setReport({
                  heading: `Undone: ${undo.heading}`,
                  items: [],
                  summary: "Your plan is back to how it was.",
                });
              }
            : undefined
        }
      />
    </div>
  );
}

/** The plan at a glance: when, how much, how far along, and what needs attention. */
function Overview({ plan, today }: { plan: Plan; today: string }) {
  const { brief } = plan;
  const summary = summariseBudget(plan.budget, brief);
  const upNext = nextActions(plan.tasks, 1)[0];
  const payments = summarisePayments(plan.vendors, today);

  return (
    <section className="overview" aria-labelledby="overview-heading">
      <h1 id="overview-heading">{brief.title}</h1>
      <p className="meta">
        {EVENT_TYPE_LABEL[brief.eventType]} · {formatDate(brief.eventDate)} · {brief.guestCount} guests
        {brief.city && ` · ${brief.city}`}
      </p>
      <dl className="stats">
        <div>
          <dt>Days to go</dt>
          <dd>{daysToGo(daysBetween(today, brief.eventDate))}</dd>
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
            {plan.tasks.filter((t) => t.status === "done").length} <small>of {plan.tasks.length}</small>
          </dd>
        </div>
      </dl>
      {summary.overBy > 0 && (
        <p className="callout warning">
          The plan is {formatInr(summary.overBy)} over budget. <a href="#budget">Choose a trade-off</a>.
        </p>
      )}
      {payments.overdue.length > 0 && (
        <p className="callout warning">
          Overdue: {payments.overdue.map(describePayment).join("; ")}. <a href="#vendors">See vendors</a>
        </p>
      )}
      {upNext && (
        <p className="next-up">
          <strong>Next up:</strong> {upNext.title}, due {formatDate(upNext.dueDate)}.{" "}
          <a href="#timeline">See the timeline</a>
        </p>
      )}
      {payments.next && (
        <p className="next-up">
          <strong>Next payment:</strong> {describePayment(payments.next)}.
        </p>
      )}
      <PlanSharing plan={plan} />
    </section>
  );
}

function daysToGo(days: number): number | string {
  if (days > 0) return days;
  return days === 0 ? "Today" : "Passed";
}

function describePayment({ vendor, payment }: DuePayment): string {
  return `${formatInr(payment.amount)} to ${vendor} (${payment.label}, due ${formatDate(payment.dueDate)})`;
}

function SectionNav() {
  return (
    <nav className="section-nav" aria-label="Plan sections">
      <a href="#change">What changed?</a>
      <a href="#budget">Budget</a>
      <a href="#timeline">Timeline</a>
      <a href="#on-the-day">On the day</a>
      <a href="#vendors">Vendors</a>
      <a href="#guests">Guests</a>
      <a href="#ideas">Ideas</a>
    </nav>
  );
}
