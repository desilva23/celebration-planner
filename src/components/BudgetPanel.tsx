"use client";

import { useState } from "react";
import { CATEGORY_META } from "@/lib/domain/assumptions";
import { summariseBudget, type BudgetSummary } from "@/lib/domain/budget";
import { formatInr } from "@/lib/domain/format";
import { summarisePayments } from "@/lib/domain/payments";
import { applyChange, applyTradeoff, PlanError, setBudgetAmount } from "@/lib/domain/plan";
import type { BudgetLine, CategoryId, EventBrief, Plan } from "@/lib/domain/schema";
import { tradeoffOptions, type TradeoffOption } from "@/lib/domain/tradeoffs";
import type { PanelProps } from "./PlanDashboard";
import { categoryLabel, ErrorMessage, Section, SourceBadge } from "./ui";

const MAX_PRIORITIES = 4;

export function BudgetPanel({ plan, today, onChange, onUpdate }: PanelProps) {
  const summary = summariseBudget(plan.budget, plan.brief);
  const options = tradeoffOptions(plan);
  const { paid } = summarisePayments(plan.vendors, today);

  return (
    <Section
      id="budget"
      title="Budget"
      intro={
        <>
          <SourceBadge source="estimate" /> amounts are planning assumptions, not vendor prices. They turn{" "}
          <SourceBadge source="confirmed" /> when you book a vendor, and are then never rescaled or cut automatically.
        </>
      }
    >
      <BudgetTotals summary={summary} paid={paid} tier={plan.brief.tier} />
      {options.length > 0 && (
        <Tradeoffs plan={plan} today={today} overBy={summary.overBy} options={options} onUpdate={onUpdate} />
      )}
      <BudgetTable plan={plan} planned={summary.planned} onChange={onChange} />
    </Section>
  );
}

/** Planned against budget, what's confirmed and paid, and whether catering looks thin. */
function BudgetTotals({ summary, paid, tier }: { summary: BudgetSummary; paid: number; tier: EventBrief["tier"] }) {
  return (
    <>
      <p className="budget-total">
        Planned <strong>{formatInr(summary.planned)}</strong> of {formatInr(summary.budget)}
        <Balance overBy={summary.overBy} />
        {summary.confirmed > 0 && <span> · {formatInr(summary.confirmed)} confirmed</span>}
        {paid > 0 && <span> · {formatInr(paid)} paid</span>}
      </p>
      <meter
        className="budget-meter"
        min={0}
        max={summary.budget}
        low={summary.budget * 0.85}
        high={summary.budget}
        optimum={summary.budget * 0.5}
        value={Math.min(summary.planned, summary.budget)}
        aria-label="Share of the budget that is planned"
      />
      {summary.cateringLooksThin && summary.cateringPerGuest !== null && (
        <p className="callout warning">
          Catering works out to {formatInr(summary.cateringPerGuest)} per guest. A {tier} event usually needs around{" "}
          {formatInr(summary.cateringAssumption)} (a rough assumption; check with caterers).
        </p>
      )}
    </>
  );
}

function Balance({ overBy }: { overBy: number }) {
  if (overBy > 0) return <strong className="warn-text"> · {formatInr(overBy)} over</strong>;
  if (overBy < 0) return <span> · {formatInr(-overBy)} unallocated</span>;
  return <span> · fully allocated</span>;
}

/** Ways back into budget, each with its consequences, and which lines to protect while cutting. */
function Tradeoffs({
  plan,
  today,
  overBy,
  options,
  onUpdate,
}: {
  plan: Plan;
  today: string;
  overBy: number;
  options: TradeoffOption[];
  onUpdate: PanelProps["onUpdate"];
}) {
  const [priorityError, setPriorityError] = useState<string | null>(null);

  function choose(option: TradeoffOption) {
    onUpdate(
      {
        plan: applyTradeoff(plan, option),
        effects: option.impacts.map((message) => ({ tone: "info", message })),
      },
      `Applied: ${option.title}`,
    );
  }

  function togglePriority(category: CategoryId) {
    const { priorities: current } = plan.brief;
    const priorities = current.includes(category) ? current.filter((p) => p !== category) : [...current, category];
    try {
      onUpdate(applyChange(plan, { priorities }, today), "Priorities updated");
      setPriorityError(null);
    } catch (error) {
      setPriorityError(error instanceof PlanError ? error.message : "Priorities couldn't be updated.");
    }
  }

  return (
    <div className="tradeoffs">
      <h3>You’re {formatInr(overBy)} over. What would you rather give up?</h3>
      <fieldset>
        <legend>Protect these when cutting (up to {MAX_PRIORITIES})</legend>
        {priorityError && <ErrorMessage>{priorityError}</ErrorMessage>}
        <PriorityBoxes plan={plan} onToggle={togglePriority} />
      </fieldset>
      <ul className="option-grid">
        {options.map((option) => (
          <TradeoffCard key={option.id} option={option} onChoose={() => choose(option)} />
        ))}
      </ul>
    </div>
  );
}

function PriorityBoxes({ plan, onToggle }: { plan: Plan; onToggle: (category: CategoryId) => void }) {
  const { priorities } = plan.brief;
  return (
    <div className="choice-row">
      {plan.budget
        .filter((l) => l.category !== "contingency" && l.source === "estimate")
        .map(({ category }) => {
          const checked = priorities.includes(category);
          return (
            <label key={category} className="choice">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && priorities.length >= MAX_PRIORITIES}
                onChange={() => onToggle(category)}
              />
              {categoryLabel(category)}
            </label>
          );
        })}
    </div>
  );
}

function TradeoffCard({ option, onChoose }: { option: TradeoffOption; onChoose: () => void }) {
  return (
    <li className={`option${option.feasible ? "" : " infeasible"}`}>
      <h4>{option.title}</h4>
      <ul>
        {option.impacts.map((impact) => (
          <li key={impact}>{impact}</li>
        ))}
      </ul>
      <button
        type="button"
        className="button secondary"
        disabled={!option.feasible}
        onClick={onChoose}
        aria-describedby={option.feasible ? undefined : `${option.id}-why`}
      >
        Choose this
      </button>
      {!option.feasible && (
        <p className="hint" id={`${option.id}-why`}>
          Doesn’t close the gap on its own.
        </p>
      )}
    </li>
  );
}

function BudgetTable({ plan, planned, onChange }: { plan: Plan; planned: number; onChange: PanelProps["onChange"] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">Budget by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {plan.budget.map((line) => (
            <tr key={line.category}>
              <th scope="row">
                {categoryLabel(line.category)}
                {CATEGORY_META[line.category].scalesWithGuests && (
                  <span className="hint block">Scales with guests</span>
                )}
              </th>
              <td>
                <AmountCell
                  key={`${line.category}-${line.amount}`}
                  line={line}
                  onCommit={(amount) => onChange(setBudgetAmount(plan, line.category, amount))}
                />
              </td>
              <td>{planned ? Math.round((line.amount / planned) * 100) : 0}%</td>
              <td>
                <SourceBadge source={line.source} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{formatInr(planned)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AmountCell({ line, onCommit }: { line: BudgetLine; onCommit: (amount: number) => void }) {
  const [value, setValue] = useState(String(line.amount));
  const label = `${categoryLabel(line.category)} amount in rupees`;

  if (line.source === "confirmed") return <span>{formatInr(line.amount)}</span>;

  function commit() {
    const amount = Math.round(Number(value));
    if (Number.isSafeInteger(amount) && amount >= 0 && amount !== line.amount) onCommit(amount);
    else setValue(String(line.amount));
  }

  return (
    <input
      className="amount-input"
      type="number"
      inputMode="numeric"
      min={0}
      step={500}
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
