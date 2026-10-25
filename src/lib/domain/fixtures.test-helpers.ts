import type { EventBrief } from "./schema";

export const TODAY = "2026-10-25";

/** The worked example from the challenge explainer: ₹8 lakh, 200 guests, ~4 months out. */
export function weddingBrief(overrides: Partial<EventBrief> = {}): EventBrief {
  return {
    eventType: "wedding",
    title: "Anu & Ravi's wedding",
    eventDate: "2027-03-01",
    guestCount: 200,
    totalBudget: 800_000,
    tier: "standard",
    city: "Chennai",
    priorities: ["catering", "photography"],
    notes: "",
    ...overrides,
  };
}
