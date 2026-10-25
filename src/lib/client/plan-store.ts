// The plan lives in this browser's localStorage. It is validated on every
// read, so a corrupted or outdated entry is ignored rather than crashing the app.

import { useSyncExternalStore } from "react";
import { PlanSchema, type Plan } from "../domain/schema";

const KEY = "celebration-planner:plan:v1";
const listeners = new Set<() => void>();
let cached: Plan | null | undefined;

function read(): Plan | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = PlanSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function getSnapshot(): Plan | null {
  if (cached === undefined) cached = read();
  return cached;
}

function getServerSnapshot(): undefined {
  return undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cached = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
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
  listeners.forEach((listener) => listener());
}

/** `undefined` while loading (server render), `null` when there is no plan yet. */
export function usePlan(): Plan | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
