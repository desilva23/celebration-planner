"use client";

import type { ChangeEffect } from "@/lib/domain/plan";

export interface EffectsReport {
  heading: string;
  items: ChangeEffect[];
  /** Shown instead of the list when there are no items. */
  summary?: string;
}

/** Announces what a change did to the plan, wherever on the page it was made. */
export function EffectsToast({
  report,
  onDismiss,
  onUndo,
}: {
  report: EffectsReport | null;
  onDismiss: () => void;
  /** Offered only while the change can still be undone. */
  onUndo?: () => void;
}) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {report && (
        <div className="toast">
          <div className="toast-head">
            <h2>{report.heading}</h2>
            <div className="toast-actions">
              {onUndo && (
                <button type="button" className="button secondary small" onClick={onUndo}>
                  Undo
                </button>
              )}
              <button type="button" className="button ghost small" onClick={onDismiss}>
                Dismiss
              </button>
            </div>
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
            <p>{report.summary ?? "Nothing else needed to move."}</p>
          )}
        </div>
      )}
    </div>
  );
}
