import type { EventBrief, Plan, Vendor } from "./schema";

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

/** A quoted venue, ready to book. */
export const venueVendor: Vendor = {
  id: "v1",
  category: "venue",
  name: "Lotus Hall",
  contact: "",
  quote: 150_000,
  status: "quoted",
  notes: "",
  payments: [],
};

/** A plan's budget line for `category`. */
export const line = (plan: Plan, category: string) => plan.budget.find((l) => l.category === category)!;

/** Just the messages of a change's effects. */
export const messages = (effects: { message: string }[]) => effects.map((e) => e.message);
