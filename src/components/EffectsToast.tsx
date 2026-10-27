"use client";

import type { ChangeEffect } from "@/lib/domain/plan";

export interface EffectsReport {
  heading: string;
  items: ChangeEffect[];
  /** Shown instead of the list when there are no items. */
  summary?: string;
}

const NOTHING_MOVED = "Nothing else needed to move.";

/** The report as sentences for screen readers, with warnings marked as such. */
function announcement(report: EffectsReport): string {
  const details = report.items.length
    ? report.items.map((item) => (item.tone === "warning" ? `Warning: ${item.message}` : item.message))
    : [report.summary ?? NOTHING_MOVED];
  return [report.heading, ...details].map((part) => (/[.!?]$/.test(part) ? part : `${part}.`)).join(" ");
}

/**
 * Announces what a change did to the plan, wherever on the page it was made.
 * Screen readers hear it from a live region that holds only that text; the
 * visible notice, with its buttons, sits outside the live region.
 */
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
    <div className="toast-region">
      <div role="status" className="visually-hidden">
        {report ? announcement(report) : ""}
      </div>
      {report && (
        <section className="toast" aria-labelledby="toast-heading">
          <div className="toast-head">
            <h2 id="toast-heading">{report.heading}</h2>
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
            <p>{report.summary ?? NOTHING_MOVED}</p>
          )}
        </section>
      )}
    </div>
  );
}
