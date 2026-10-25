// Planning assumptions. These are illustrative starting points for a first
// draft, not market prices, and the UI labels every number derived from them
// as an estimate. Replace them with real quotes as the user collects them.

import type { CategoryId, EventType, Tier } from "./schema";

export interface CategoryMeta {
  label: string;
  /** Cost grows with headcount (food, invitations). */
  scalesWithGuests: boolean;
  /** Share of the current amount that cannot be cut without breaking the line. */
  floor: number;
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  venue: { label: "Venue", scalesWithGuests: false, floor: 0.7 },
  catering: { label: "Catering", scalesWithGuests: true, floor: 0.6 },
  decor: { label: "Decor", scalesWithGuests: false, floor: 0.3 },
  photography: { label: "Photography", scalesWithGuests: false, floor: 0.4 },
  entertainment: { label: "Entertainment", scalesWithGuests: false, floor: 0.2 },
  attire: { label: "Attire", scalesWithGuests: false, floor: 0.5 },
  invitations: { label: "Invitations", scalesWithGuests: true, floor: 0.3 },
  transport: { label: "Transport", scalesWithGuests: false, floor: 0.3 },
  contingency: { label: "Contingency", scalesWithGuests: false, floor: 0 },
};

/** Share of the total budget per category. Each row sums to 1. */
// prettier-ignore
export const BUDGET_WEIGHTS: Record<EventType, Partial<Record<CategoryId, number>>> = {
  wedding: {
    venue: 0.22, catering: 0.32, decor: 0.12, photography: 0.1, entertainment: 0.05,
    attire: 0.08, invitations: 0.03, transport: 0.03, contingency: 0.05,
  },
  birthday: {
    venue: 0.2, catering: 0.35, decor: 0.15, photography: 0.07, entertainment: 0.1,
    attire: 0.03, invitations: 0.02, transport: 0.02, contingency: 0.06,
  },
  anniversary: {
    venue: 0.22, catering: 0.35, decor: 0.12, photography: 0.08, entertainment: 0.07,
    attire: 0.05, invitations: 0.03, transport: 0.02, contingency: 0.06,
  },
  community: {
    venue: 0.2, catering: 0.3, decor: 0.08, photography: 0.05, entertainment: 0.15,
    invitations: 0.05, transport: 0.07, contingency: 0.1,
  },
  other: {
    venue: 0.22, catering: 0.33, decor: 0.12, photography: 0.07, entertainment: 0.08,
    attire: 0.03, invitations: 0.03, transport: 0.04, contingency: 0.08,
  },
};

/** Rough catering cost per guest, used only to warn when a line looks thin. */
export const CATERING_PER_GUEST: Record<Tier, number> = {
  simple: 400,
  standard: 800,
  premium: 1600,
};

/** How far ahead planning ideally starts, in days. */
export const PLANNING_HORIZON_DAYS: Record<EventType, number> = {
  wedding: 120,
  birthday: 30,
  anniversary: 45,
  community: 60,
  other: 45,
};

export interface TaskTemplate {
  id: string;
  title: string;
  category: CategoryId | "planning";
  /** When the task is due, as a fraction of the horizon before the event. */
  due: number;
  /** How long it takes, as a fraction of the horizon. */
  span: number;
  dependsOn: string[];
  priority: "high" | "medium" | "low";
}

// Ordered so that every dependency appears before its dependents and is due
// earlier, which keeps scheduling a single forward pass.
// prettier-ignore
export const TASK_TEMPLATES: TaskTemplate[] = [
  { id: "budget", title: "Agree the total budget and what matters most", category: "planning", due: 0.95, span: 0.05, dependsOn: [], priority: "high" },
  { id: "guests-draft", title: "Draft the guest list", category: "planning", due: 0.88, span: 0.07, dependsOn: ["budget"], priority: "high" },
  { id: "venue", title: "Shortlist and book the venue", category: "venue", due: 0.75, span: 0.13, dependsOn: ["guests-draft"], priority: "high" },
  { id: "caterer", title: "Compare catering quotes and book a caterer", category: "catering", due: 0.6, span: 0.15, dependsOn: ["venue"], priority: "high" },
  { id: "photographer", title: "Book photography", category: "photography", due: 0.55, span: 0.15, dependsOn: ["venue"], priority: "medium" },
  { id: "decor", title: "Finalise the decor concept and decorator", category: "decor", due: 0.45, span: 0.12, dependsOn: ["venue"], priority: "medium" },
  { id: "entertainment", title: "Book entertainment", category: "entertainment", due: 0.45, span: 0.12, dependsOn: ["venue"], priority: "low" },
  { id: "guests-final", title: "Finalise the guest list", category: "planning", due: 0.45, span: 0.1, dependsOn: ["guests-draft"], priority: "high" },
  { id: "invitations", title: "Send invitations", category: "invitations", due: 0.35, span: 0.08, dependsOn: ["venue", "guests-final"], priority: "high" },
  { id: "attire", title: "Arrange outfits", category: "attire", due: 0.3, span: 0.15, dependsOn: [], priority: "medium" },
  { id: "menu", title: "Confirm the menu and dietary needs", category: "catering", due: 0.2, span: 0.08, dependsOn: ["caterer", "guests-final"], priority: "medium" },
  { id: "transport", title: "Arrange guest transport", category: "transport", due: 0.15, span: 0.08, dependsOn: ["venue", "guests-final"], priority: "low" },
  { id: "confirm", title: "Reconfirm every vendor, time and payment", category: "planning", due: 0.06, span: 0.04, dependsOn: ["caterer", "photographer", "decor"], priority: "high" },
  { id: "run-sheet", title: "Write the day-of run sheet", category: "planning", due: 0.03, span: 0.03, dependsOn: ["confirm"], priority: "high" },
];
