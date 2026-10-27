// Built-in vendor briefs: the event's requirements, then what to ask and watch for.

import { formatDate, formatInr } from "../../domain/format";
import type { VendorBriefRequest, VendorBriefResult } from "../contracts";
import { FIRST_QUESTION, GENERAL_ADVICE, LAST_QUESTIONS, VENDOR_SPECIFICS } from "./vendor-brief.data";

export function vendorBriefFallback({ category, brief, budgetForCategory }: VendorBriefRequest): VendorBriefResult {
  const specific = VENDOR_SPECIFICS[category] ?? GENERAL_ADVICE;
  return {
    requirements: [
      `${brief.guestCount} guests on ${formatDate(brief.eventDate)}${brief.city ? ` in ${brief.city}` : ""}`,
      `Planned spend around ${formatInr(budgetForCategory)}`,
      ...(brief.notes ? [`Your notes: ${brief.notes.slice(0, 120)}`] : []),
    ],
    questions: [FIRST_QUESTION, ...specific.questions, ...LAST_QUESTIONS],
    watchOuts: specific.watchOuts,
  };
}
