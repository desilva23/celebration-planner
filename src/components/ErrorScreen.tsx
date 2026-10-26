"use client";

import { useEffect } from "react";
import { setAsideSavedPlan } from "@/lib/client/plan-store";

/**
 * Shown instead of the page when rendering fails. The plan is still saved, so
 * the user can retry, or start over with the plan kept aside to download.
 */
export function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Stays in this browser's console; nothing is sent anywhere.
    console.error(error);
  }, [error]);

  function startOver() {
    setAsideSavedPlan();
    reset();
  }

  return (
    <main id="main" className="container" tabIndex={-1}>
      <div className="card">
        <h1>Something went wrong</h1>
        <p>The planner hit a problem showing this page. Your plan is still saved in this browser.</p>
        <div className="actions">
          <button type="button" className="button primary" onClick={reset}>
            Try again
          </button>
          <button type="button" className="button secondary" onClick={startOver}>
            Start over and keep a copy of my plan
          </button>
        </div>
      </div>
    </main>
  );
}
