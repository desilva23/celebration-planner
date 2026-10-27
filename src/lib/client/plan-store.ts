// The plan lives in this browser's localStorage and is validated on every
// read. A saved plan that fails validation (saved by another version of the
// app, or edited by hand) is moved aside rather than ignored, so starting a
// new plan can't overwrite it and the user can still download it.

import { useSyncExternalStore } from "react";
import type { Plan } from "../domain/schema";
import { parsePlan } from "./plan-file";

const KEY = "celebration-planner:plan:v1";
const SET_ASIDE_KEY = "celebration-planner:set-aside-plan";
const listeners = new Set<() => void>();
let cached: Plan | null | undefined;
let setAsideText: string | null | undefined;

function getItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Storage blocked, as in some private browsing modes.
  }
}

function setAside(raw: string): void {
  setAsideText = raw;
  try {
    window.localStorage.setItem(SET_ASIDE_KEY, raw);
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage refused the copy, so the original stays where it was.
  }
}

function read(): Plan | null {
  const raw = getItem(KEY);
  if (!raw) return null;
  const plan = parsePlan(raw);
  if (!plan) setAside(raw);
  return plan;
}

function getSnapshot(): Plan | null {
  if (cached === undefined) cached = read();
  return cached;
}

// Stryker disable next-line BlockStatement: returning nothing is the point
function getServerSnapshot(): undefined {
  return undefined;
}

function getSetAsideSnapshot(): string | null {
  getSnapshot(); // Reading the plan is what sets an unreadable one aside.
  if (setAsideText === undefined) setAsideText = getItem(SET_ASIDE_KEY);
  return setAsideText;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) cached = read();
    else if (event.key === SET_ASIDE_KEY) setAsideText = event.newValue;
    else return;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    // Stryker disable next-line CallExpression: only a leak; nothing reads an unmounted component's listener
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function savePlan(plan: Plan | null): void {
  cached = plan;
  try {
    if (plan) window.localStorage.setItem(KEY, JSON.stringify(plan));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage can be full or blocked (private mode). The plan still works for this session.
  }
  notify();
}

/** Moves the saved plan aside, e.g. when it can't be shown, so the user can start again without losing it. */
export function setAsideSavedPlan(): void {
  const raw = getItem(KEY);
  cached = null;
  if (raw) setAside(raw);
  notify();
}

export function discardSetAsidePlan(): void {
  setAsideText = null;
  try {
    window.localStorage.removeItem(SET_ASIDE_KEY);
  } catch {
    // Nothing more to do: it is gone from this session either way.
  }
  notify();
}

/** `undefined` while loading (server render), `null` when there is no plan yet. */
export function usePlan(): Plan | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The text of a plan that was set aside, or null when there isn't one. */
export function useSetAsidePlan(): string | null {
  return useSyncExternalStore(subscribe, getSetAsideSnapshot, () => null);
}
