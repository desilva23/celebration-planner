import { vi } from "vitest";
import { TODAY, weddingBrief } from "@/lib/domain/fixtures.test-helpers";
import { createPlan, type PlanUpdate } from "@/lib/domain/plan";
import type { EventBrief, Plan, Vendor } from "@/lib/domain/schema";

/** Pins the clock to midday on `iso` in local time, so `todayIso()` is stable. */
export function freezeToday(iso = TODAY): void {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, m - 1, d, 12));
}

export function weddingPlan(overrides: Partial<EventBrief> = {}): Plan {
  return createPlan(weddingBrief(overrides), TODAY, new Date("2026-10-25T06:30:00Z"));
}

export function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "v1",
    category: "venue",
    name: "Lotus Hall",
    contact: "",
    quote: null,
    status: "considering",
    notes: "",
    ...overrides,
  };
}

/** The props every plan panel takes, with spies for the two callbacks. */
export function panelProps(plan: Plan, today = TODAY) {
  return {
    plan,
    today,
    onChange: vi.fn<(plan: Plan) => void>(),
    onUpdate: vi.fn<(update: PlanUpdate, heading: string) => void>(),
  };
}
