"use client";

import { savePlan, usePlan } from "@/lib/client/plan-store";
import type { Plan } from "@/lib/domain/schema";
import { IntakeForm } from "./IntakeForm";
import { PlanDashboard } from "./PlanDashboard";

export function PlannerApp({ aiProvider }: { aiProvider: string | null }) {
  const plan = usePlan();

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
