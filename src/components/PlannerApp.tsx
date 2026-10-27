"use client";

import { useEffect, useState } from "react";
import { downloadFile } from "@/lib/client/plan-file";
import { discardSetAsidePlan, savePlan, setAsideSavedPlan, usePlan, useSetAsidePlan } from "@/lib/client/plan-store";
import { planFromLink } from "@/lib/client/share";
import type { Plan } from "@/lib/domain/schema";
import { IntakeForm } from "./IntakeForm";
import { PlanDashboard } from "./PlanDashboard";
import { OpenPlanFile } from "./PlanSharing";

export function PlannerApp({ aiProvider }: { aiProvider: string | null }) {
  const plan = usePlan();
  const setAside = useSetAsidePlan();
  const [shared, setShared] = useState<Plan | null>(null);

  // A share link carries a plan in its fragment; offer it rather than opening it unasked.
  useEffect(() => {
    void planFromLink(window.location.hash).then(setShared);
  }, []);

  function forgetLink() {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setShared(null);
  }

  /** The current plan, if any, is kept aside as a copy rather than replaced. */
  function openShared(next: Plan) {
    if (plan) setAsideSavedPlan();
    forgetLink();
    show(next);
  }

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
        {shared && (
          <div className="callout info" role="status">
            <p>
              <strong>A plan was shared with you: {shared.brief.title}.</strong>{" "}
              {plan
                ? "Opening it keeps your current plan as a copy you can download."
                : "It opens as your own copy in this browser."}
            </p>
            <div className="actions">
              <button type="button" className="button primary" onClick={() => openShared(shared)}>
                Open the shared plan
              </button>
              <button type="button" className="button ghost" onClick={forgetLink}>
                Not now
              </button>
            </div>
          </div>
        )}
        {setAside && <SetAsideNotice text={setAside} />}
        {plan === undefined ? (
          <p aria-live="polite">Loading your plan…</p>
        ) : plan === null ? (
          <>
            <IntakeForm onCreate={show} />
            <OpenPlanFile onOpen={show} />
          </>
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
