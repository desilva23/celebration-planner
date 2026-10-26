"use client";

import { useState, type SubmitEvent } from "react";
import type { InterpretResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import { addDays } from "@/lib/domain/dates";
import { formatDate, formatInr } from "@/lib/domain/format";
import { applyChange, PlanError } from "@/lib/domain/plan";
import {
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  TIERS,
  type EventBrief,
  type PlanChange,
  type Tier,
} from "@/lib/domain/schema";
import type { PanelProps } from "./PlanDashboard";
import { categoryLabel, ErrorMessage, Provenance, Section } from "./ui";

/** Keeps only the changeable fields that actually differ from the current brief. */
function toChange(updates: InterpretResult["updates"], brief: EventBrief): PlanChange {
  const change: PlanChange = {};
  if (updates.guestCount !== null && updates.guestCount !== brief.guestCount) change.guestCount = updates.guestCount;
  if (updates.totalBudget !== null && updates.totalBudget !== brief.totalBudget)
    change.totalBudget = updates.totalBudget;
  if (updates.eventDate !== null && updates.eventDate !== brief.eventDate) change.eventDate = updates.eventDate;
  if (updates.tier !== null && updates.tier !== brief.tier) change.tier = updates.tier;
  if (updates.priorities !== null && updates.priorities.join() !== brief.priorities.join()) {
    change.priorities = updates.priorities;
  }
  return change;
}

function describe(change: PlanChange, brief: EventBrief): string[] {
  const rows: string[] = [];
  if (change.guestCount !== undefined) rows.push(`Guests: ${brief.guestCount} → ${change.guestCount}`);
  if (change.totalBudget !== undefined) {
    rows.push(`Budget: ${formatInr(brief.totalBudget)} → ${formatInr(change.totalBudget)}`);
  }
  if (change.eventDate !== undefined) {
    rows.push(`Date: ${formatDate(brief.eventDate)} → ${formatDate(change.eventDate)}`);
  }
  if (change.tier !== undefined) rows.push(`Experience: ${brief.tier} → ${change.tier}`);
  if (change.priorities !== undefined) {
    rows.push(`Matters most: ${change.priorities.map(categoryLabel).join(", ") || "nothing protected"}`);
  }
  return rows;
}

export function ChangePanel({ plan, today, onUpdate }: PanelProps) {
  const [message, setMessage] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const interpret = useAiCall<InterpretResult>("/api/interpret");
  // After a failed preview the last result is stale, so it isn't offered for applying.
  const proposal =
    interpret.envelope && !interpret.loading && !interpret.error
      ? toChange(interpret.envelope.data.updates, plan.brief)
      : null;
  const rows = proposal ? describe(proposal, plan.brief) : [];

  function apply(change: PlanChange): boolean {
    try {
      onUpdate(applyChange(plan, change, today), "Plan revised");
      setApplyError(null);
      return true;
    } catch (error) {
      setApplyError(error instanceof PlanError ? error.message : "That change couldn't be applied.");
      return false;
    }
  }

  async function preview(event: SubmitEvent) {
    event.preventDefault();
    setApplyError(null);
    await interpret.run({ message, brief: plan.brief, today });
  }

  return (
    <Section
      id="change"
      title="Something changed?"
      intro="Say it in plain words. The plan is revised from where it stands; finished tasks and confirmed prices are kept."
    >
      <form onSubmit={preview}>
        <label htmlFor="change-message">What changed</label>
        <textarea
          id="change-message"
          rows={2}
          maxLength={600}
          placeholder="e.g. We now have 50 more guests, the budget dropped by 80k, and it's two weeks earlier"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" className="button secondary" disabled={interpret.loading || !message.trim()}>
          {interpret.loading ? "Reading…" : "Preview the changes"}
        </button>
      </form>

      <div aria-live="polite">
        {interpret.error && <ErrorMessage>{interpret.error}</ErrorMessage>}
        {applyError && <ErrorMessage>{applyError}</ErrorMessage>}
        {interpret.envelope && proposal && (
          <div className="proposal">
            <Provenance envelope={interpret.envelope} />
            <p>{interpret.envelope.data.understood}</p>
            {interpret.envelope.data.clarifyingQuestion && (
              <p className="callout info">{interpret.envelope.data.clarifyingQuestion}</p>
            )}
            {rows.length > 0 ? (
              <>
                <ul className="diff">
                  {rows.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
                <div className="actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      if (!apply(proposal)) return;
                      interpret.reset();
                      setMessage("");
                    }}
                  >
                    Apply to my plan
                  </button>
                  <button type="button" className="button ghost" onClick={interpret.reset}>
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">Nothing to change in the plan yet.</p>
            )}
          </div>
        )}
      </div>

      <details className="manual-edit">
        <summary>Or edit the details directly</summary>
        <ManualEdit key={plan.updatedAt} brief={plan.brief} today={today} onApply={apply} />
      </details>
    </Section>
  );
}

function ManualEdit({
  brief,
  today,
  onApply,
}: {
  brief: EventBrief;
  today: string;
  onApply: (c: PlanChange) => boolean;
}) {
  const [guestCount, setGuestCount] = useState(String(brief.guestCount));
  const [totalBudget, setTotalBudget] = useState(String(brief.totalBudget));
  const [eventDate, setEventDate] = useState(brief.eventDate);
  const [tier, setTier] = useState<Tier>(brief.tier);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onApply({
      guestCount: Math.max(1, Math.round(Number(guestCount)) || brief.guestCount),
      totalBudget: Math.max(MIN_BUDGET, Math.round(Number(totalBudget)) || brief.totalBudget),
      eventDate: eventDate || brief.eventDate,
      tier,
    });
  }

  return (
    <form onSubmit={submit} className="grid two">
      <div className="field">
        <label htmlFor="edit-guests">Guests</label>
        <input
          id="edit-guests"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_GUESTS}
          value={guestCount}
          onChange={(e) => setGuestCount(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-budget">Total budget (₹)</label>
        <input
          id="edit-budget"
          type="number"
          inputMode="numeric"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          value={totalBudget}
          onChange={(e) => setTotalBudget(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-date">Event date</label>
        <input
          id="edit-date"
          type="date"
          min={addDays(today, 1)}
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-tier">Experience</label>
        <select id="edit-tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button type="submit" className="button secondary">
          Update the plan
        </button>
      </div>
    </form>
  );
}
