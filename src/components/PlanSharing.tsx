"use client";

import { useState, type ChangeEvent } from "react";
import { downloadFile, fileSlug, parsePlan } from "@/lib/client/plan-file";
import { shareLink } from "@/lib/client/share";
import { calendarFile } from "@/lib/domain/calendar";
import type { Plan } from "@/lib/domain/schema";
import { ErrorMessage } from "./ui";

/** Save a copy of the plan, share one, or put its dates in a calendar. */
export function PlanSharing({ plan }: { plan: Plan }) {
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const name = fileSlug(plan.brief.title);

  async function copyLink() {
    const link = await shareLink(plan, window.location.origin);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setManualLink(null);
    } catch {
      // The clipboard can be unavailable or refused; show the link to copy by hand.
      setCopied(false);
      setManualLink(link);
    }
  }

  return (
    <div className="plan-sharing">
      <div className="actions">
        <button
          type="button"
          className="button ghost small"
          onClick={() => downloadFile(`${name}.json`, JSON.stringify(plan, null, 2))}
        >
          Download plan
        </button>
        <button type="button" className="button ghost small" onClick={() => void copyLink()}>
          Copy share link
        </button>
        <button
          type="button"
          className="button ghost small"
          onClick={() => downloadFile(`${name}-dates.ics`, calendarFile(plan), "text/calendar")}
        >
          Add dates to calendar
        </button>
      </div>
      <div aria-live="polite">
        {copied && (
          <p className="hint">
            Link copied. Anyone with it can open their own copy of this plan, without the guest list. Changes don’t
            sync.
          </p>
        )}
        {manualLink && (
          <div className="field">
            <label htmlFor="share-link">Copy this link to share a copy of the plan, without the guest list</label>
            <input id="share-link" type="text" readOnly value={manualLink} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Opens a plan file downloaded earlier, on this device or another. */
export function OpenPlanFile({ onOpen }: { onOpen: (plan: Plan) => void }) {
  const [problem, setProblem] = useState<string | null>(null);

  async function open(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const plan = parsePlan(await file.text());
    input.value = "";
    if (plan) onOpen(plan);
    else setProblem("That file isn’t a plan this app can open.");
  }

  return (
    <section className="card" aria-labelledby="open-plan-heading">
      <h2 id="open-plan-heading">Already have a plan?</h2>
      <label htmlFor="open-plan">Open a plan file you downloaded</label>
      <input id="open-plan" type="file" accept=".json,application/json" onChange={(e) => void open(e)} />
      {problem && <ErrorMessage>{problem}</ErrorMessage>}
    </section>
  );
}
