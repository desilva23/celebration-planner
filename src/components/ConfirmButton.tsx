"use client";

import { useId, useRef } from "react";

export interface ConfirmButtonProps {
  label: string;
  className: string;
  question: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/**
 * A button for something that can't be undone, which asks first in the
 * browser's own modal dialog: focus moves in and stays there, the page behind
 * is inert, Escape cancels, and focus goes back to the button. The safe choice
 * comes first, so it is the one focused.
 */
export function ConfirmButton({
  label,
  className,
  question,
  detail,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const questionId = useId();
  const detailId = useId();

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={dialog}
        role="alertdialog"
        className="dialog"
        aria-labelledby={questionId}
        aria-describedby={detailId}
      >
        <h2 id={questionId}>{question}</h2>
        <p id={detailId}>{detail}</p>
        <div className="actions">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              dialog.current?.close();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
