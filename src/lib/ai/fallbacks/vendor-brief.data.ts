// What to ask vendors before booking: general questions, and specifics for
// the vendor types that have their own.

import type { CategoryId } from "../../domain/schema";

interface Advice {
  questions: string[];
  watchOuts: string[];
}

export const VENDOR_SPECIFICS: Partial<Record<CategoryId, Advice>> = {
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

/** For a vendor type without specifics of its own. */
export const GENERAL_ADVICE: Advice = {
  questions: [],
  watchOuts: ["Taxes and service charges added on top of the quote"],
};

/** Asked of every vendor: first, before the specifics, and last, after them. */
export const FIRST_QUESTION = "What exactly is included in the quoted price?";
export const LAST_QUESTIONS = [
  "Are taxes and service charges included?",
  "What happens to the price if our guest count changes?",
  "What is the payment schedule, and the cancellation policy?",
];
