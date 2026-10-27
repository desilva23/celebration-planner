// Built-in vendor briefs: general questions plus a few per vendor type.

import { formatDate, formatInr } from "../../domain/format";
import type { CategoryId } from "../../domain/schema";
import type { VendorBriefRequest, VendorBriefResult } from "../contracts";

// Stryker disable StringLiteral: wording of built-in suggestions; tests check their structure and the contracts, not copy
const VENDOR_SPECIFICS: Partial<Record<CategoryId, { questions: string[]; watchOuts: string[] }>> = {
  venue: {
    questions: [
      "What is the seated and standing capacity?",
      "Is there an hourly overtime charge, and what time must we leave?",
    ],
    watchOuts: ["Mandatory in-house catering or decor tie-ins", "Separate charges for generator backup or parking"],
  },
  catering: {
    questions: [
      "Is the price per plate, and what's the minimum guaranteed count?",
      "Can we do a tasting before confirming the menu?",
    ],
    watchOuts: ["Service staff and crockery billed separately", "Charges for guests above the guaranteed count"],
  },
  photography: {
    questions: ["How many photographers and hours are included?", "When are edited photos and videos delivered?"],
    watchOuts: ["Album printing billed separately", "Travel and stay costs for out-of-town shoots"],
  },
  decor: {
    questions: ["Are fresh or artificial flowers quoted?", "Who handles setup and teardown, and when?"],
    watchOuts: ["Venue restrictions on open flames or nails", "Rush charges for last-minute changes"],
  },
  entertainment: {
    questions: [
      "What equipment do you bring, and what does the venue need to provide?",
      "How long is the performance, and are breaks included?",
    ],
    watchOuts: ["Sound limits or curfews at the venue", "Extra charges for additional hours"],
  },
};
// Stryker restore StringLiteral

export function vendorBriefFallback({ category, brief, budgetForCategory }: VendorBriefRequest): VendorBriefResult {
  const specific = VENDOR_SPECIFICS[category] ?? {
    questions: [],
    watchOuts: ["Taxes and service charges added on top of the quote"],
  };
  return {
    requirements: [
      `${brief.guestCount} guests on ${formatDate(brief.eventDate)}${brief.city ? ` in ${brief.city}` : ""}`,
      `Planned spend around ${formatInr(budgetForCategory)}`,
      ...(brief.notes ? [`Your notes: ${brief.notes.slice(0, 120)}`] : []),
    ],
    // Stryker disable StringLiteral: wording
    questions: [
      "What exactly is included in the quoted price?",
      ...specific.questions,
      "Are taxes and service charges included?",
      "What happens to the price if our guest count changes?",
      "What is the payment schedule, and the cancellation policy?",
    ],
    // Stryker restore StringLiteral
    watchOuts: specific.watchOuts,
  };
}
