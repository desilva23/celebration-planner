import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no modal dialogs. Opening and closing are all component tests
// need; focus handling and the inert page behind are checked in the browser tests.
Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.open = true;
  },
  close(this: HTMLDialogElement) {
    this.open = false;
  },
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
