"use client";

import { downloadFile } from "@/lib/client/plan-file";
import { discardSetAsidePlan, savePlan, usePlan, useSetAsidePlan } from "@/lib/client/plan-store";
import type { Plan } from "@/lib/domain/schema";
import { IntakeForm } from "./IntakeForm";
import { PlanDashboard } from "./PlanDashboard";

export function PlannerApp({ aiProvider }: { aiProvider: string | null }) {
  const plan = usePlan();
  const setAside = useSetAsidePlan();

  /** Swapping views leaves the old scroll position and focus behind, so reset both. */
  function show(next: Plan | null) {
    savePlan(next);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      document.getElementById("main")?.focus();
    });
  }

  function startOver() {
    if (window.confirm("Start a new plan? This removes the current plan from this browser.")) show(null);
  }

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <span className="brand">Celebration Planner</span>
          <span className={`status ${aiProvider ? "on" : "off"}`}>
            {aiProvider ? `AI assistant on (${aiProvider})` : "AI off, using built-in suggestions"}
          </span>
          {plan && (
            <button type="button" className="button ghost" onClick={startOver}>
              New plan
            </button>
          )}
        </div>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        {setAside && <SetAsideNotice text={setAside} />}
        {plan === undefined ? (
          <p aria-live="polite">Loading your plan…</p>
        ) : plan === null ? (
          <IntakeForm onCreate={show} />
        ) : (
          <PlanDashboard plan={plan} onChange={savePlan} />
        )}
      </main>
    </>
  );
}

/** A plan that couldn't be shown is kept aside, never dropped silently. */
function SetAsideNotice({ text }: { text: string }) {
  function remove() {
    if (window.confirm("Remove the copy of your previous plan? This can't be undone.")) discardSetAsidePlan();
  }

  return (
    <div className="callout warning" role="status">
      <p>
        <strong>Your previous plan was set aside.</strong> It couldn’t be shown, perhaps because a different version of
        the planner saved it. A copy is kept in this browser.
      </p>
      <div className="actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => downloadFile("previous-celebration-plan.json", text)}
        >
          Download the copy
        </button>
        <button type="button" className="button ghost" onClick={remove}>
          Remove the copy
        </button>
      </div>
    </div>
  );
}
