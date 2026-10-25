"use client";

import type { ChangeEffect } from "@/lib/domain/plan";

export interface EffectsReport {
  heading: string;
  items: ChangeEffect[];
}

/** Announces what a change did to the plan, wherever on the page it was made. */
export function EffectsToast({ report, onDismiss }: { report: EffectsReport | null; onDismiss: () => void }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {report && (
        <div className="toast">
          <div className="toast-head">
            <h2>{report.heading}</h2>
            <button type="button" className="button ghost small" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
          {report.items.length ? (
            <ul>
              {report.items.map((item, i) => (
                <li key={i} className={item.tone === "warning" ? "warn-text" : undefined}>
                  {item.tone === "warning" && <span className="visually-hidden">Warning: </span>}
                  {item.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nothing else needed to move.</p>
          )}
        </div>
      )}
    </div>
  );
}
