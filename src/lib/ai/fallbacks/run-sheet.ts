// Built-in run sheet: a standard timetable around guest arrival.

import type { CategoryId, EventType } from "../../domain/schema";
import type { RunSheetRequest, RunSheetResult, RunSheetRole } from "../contracts";

const MAIN_MOMENT: Record<EventType, string> = {
  wedding: "Ceremony",
  birthday: "Cake cutting",
  anniversary: "Toasts and a few words from the family",
  community: "Main programme",
  other: "Main programme",
};

interface RunSheetStep {
  /** Minutes from guest arrival. */
  offset: number;
  title: string;
  details: string;
  /** The kind of vendor that usually handles it, if one is booked. */
  category?: CategoryId;
  /** Who handles it otherwise. */
  role: RunSheetRole;
}

function runSheetSteps(eventType: EventType): RunSheetStep[] {
  // One step per line reads as a timetable.
  // Stryker disable StringLiteral: wording of built-in suggestions; tests check their structure and the contracts, not copy
  // prettier-ignore
  return [
    { offset: -180, title: "Venue opens for setup", details: "Seating and stage go in; check step-free access.", category: "venue", role: "Venue staff" },
    { offset: -150, title: "Decor finishing touches", details: "Entrance, stage and photo corner ready.", category: "decor", role: "Hosts" },
    { offset: -120, title: "Catering setup", details: "Kitchen and serving area ready; confirm the final headcount.", category: "catering", role: "Hosts" },
    { offset: -60, title: "Photos before guests arrive", details: "Decor and family shots while it is calm.", category: "photography", role: "Family" },
    { offset: -30, title: "Sound check and walk-through", details: "Music, microphones and lighting; go over the order of the day.", category: "entertainment", role: "Hosts" },
    { offset: 0, title: "Guests arrive", details: "Welcome everyone and seat elderly guests first.", role: "Hosts" },
    { offset: 60, title: MAIN_MOMENT[eventType], details: "Keep to time so the food isn't kept waiting.", role: "Family" },
    { offset: 120, title: "Food is served", details: "Label vegetarian, Jain and allergen-free dishes clearly.", category: "catering", role: "Hosts" },
    { offset: 240, title: "Send-off", details: "Thank guests and hand out return gifts, if any.", role: "Everyone" },
    { offset: 270, title: "Pack-up and settling up", details: "Pay balances due today and check nothing is left behind.", role: "Hosts" },
  ];
  // Stryker restore StringLiteral
}

/** "18:00" plus `offset` minutes, wrapping past midnight. */
function clockTime(start: string, offset: number): string {
  const minutes = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + offset + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function runSheetFallback({ brief, startTime, vendors }: RunSheetRequest): RunSheetResult {
  const booked = new Map(vendors.map((v) => [v.category, v.name]));
  return {
    items: runSheetSteps(brief.eventType).map((step) => ({
      time: clockTime(startTime, step.offset),
      title: step.title,
      details: step.details,
      who: (step.category && booked.get(step.category)) || step.role,
    })),
    // Stryker disable StringLiteral: wording
    reminders: [
      "Share this run sheet with family and every vendor the day before.",
      "Keep vendor phone numbers and any balances due today in one place.",
      "Pack an emergency kit: safety pins, medicines, chargers and cash for tips.",
    ],
    // Stryker restore StringLiteral
  };
}
