// Built-in run sheet: the standard timetable, timed from guest arrival, with
// booked vendors named for their own steps.

import type { RunSheetRequest, RunSheetResult } from "../contracts";
import { REMINDERS, runSheetSteps } from "./run-sheet.data";

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
    reminders: [...REMINDERS],
  };
}
