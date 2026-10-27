// Deterministic stand-ins used when no API key is configured or the model is
// unavailable. They are deliberately modest, and the UI labels them as
// built-in suggestions rather than AI output.

import { CATEGORY_META } from "../domain/assumptions";
import { addDays, daysBetween } from "../domain/dates";
import { formatDate, formatInr } from "../domain/format";
import {
  GuestCountSchema,
  IsoDateSchema,
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  TotalBudgetSchema,
  type CategoryId,
  type EventType,
} from "../domain/schema";
import type {
  IdeasRequest,
  IdeasResult,
  InterpretRequest,
  InterpretResult,
  RunSheetRequest,
  RunSheetResult,
  RunSheetRole,
  VendorBriefRequest,
  VendorBriefResult,
} from "./contracts";
import { totalIdeaCost } from "./idea-cost";
import { AMOUNT, parseAmount, parseCount } from "./numbers";

// --- Interpret ---------------------------------------------------------------

const COUNT = String.raw`(\d[\d,]*|[a-z]+)`;
const PEOPLE = String.raw`(?:guests?|people|persons|attendees|pax)`;
const SPAN = String.raw`(days?|weeks?|months?)`;
const DAYS_PER = { day: 1, week: 7, month: 30 };

const EVENT_KEYWORDS: [RegExp, EventType][] = [
  [/\b(wedding|marriage|shaadi|reception)\b/, "wedding"],
  [/\bbirthday\b/, "birthday"],
  [/\banniversary\b/, "anniversary"],
  [/\b(community|society|festival|puja|pooja|fundraiser|meetup)\b/, "community"],
];

const PRIORITY_KEYWORDS: [RegExp, CategoryId][] = [
  [/\b(food|catering|menu|meal)/, "catering"],
  [/\b(photo|photos|photography|video)/, "photography"],
  [/\bvenue|\bhall\b/, "venue"],
  [/\b(decor|decoration|flowers)/, "decor"],
  [/\b(music|dj|band|entertainment)/, "entertainment"],
  [/\b(outfit|attire|clothes|dress)/, "attire"],
];

function spanDays(count: string, unit: string): number | null {
  const n = parseCount(count);
  // SPAN only captures day(s), week(s) or month(s).
  return n === null ? null : n * DAYS_PER[unit.replace(/s$/, "") as keyof typeof DAYS_PER];
}

export function interpretFallback({ message, brief, today }: InterpretRequest): InterpretResult {
  const text = message.toLowerCase();
  const updates: InterpretResult["updates"] = {
    eventType: null,
    title: null,
    eventDate: null,
    guestCount: null,
    totalBudget: null,
    tier: null,
    city: null,
    priorities: null,
    notes: null,
  };
  const understood: string[] = [];
  let clarifyingQuestion: string | null = null;

  for (const [pattern, type] of EVENT_KEYWORDS) {
    if (!brief && pattern.test(text)) {
      updates.eventType = type;
      understood.push(`${/^[aeiou]/.test(type) ? "an" : "a"} ${type}`);
      break;
    }
  }

  // Capture groups that a pattern always fills when it matches are asserted
  // with "!"; optional ones (amount units) are passed on as possibly undefined.

  // Guests: relative ("50 more guests") needs a current brief; absolute ("200 guests") doesn't.
  const more = text.match(new RegExp(`${COUNT}\\s+(more|extra|additional|fewer|less)\\s+${PEOPLE}`));
  const absolute = text.match(new RegExp(`(\\d[\\d,]*)\\s*${PEOPLE}`));
  if (more && brief) {
    const n = parseCount(more[1]!);
    if (n !== null) updates.guestCount = Math.max(1, brief.guestCount + (/fewer|less/.test(more[2]!) ? -n : n));
  } else if (absolute) {
    updates.guestCount = parseCount(absolute[1]!);
  }
  if (updates.guestCount !== null && !GuestCountSchema.safeParse(updates.guestCount).success) {
    updates.guestCount = null;
    clarifyingQuestion = `How many guests should the plan be for? It handles up to ${MAX_GUESTS.toLocaleString("en-IN")}.`;
  }
  if (updates.guestCount !== null) understood.push(`${updates.guestCount} guests`);

  // Budget: "budget dropped by 80k", "budget is 8 lakh", "₹5,00,000".
  const shift = text.match(
    new RegExp(
      `budget\\s+(?:has\\s+)?(dropped|reduced|cut|decreased|fell|went down|increased|went up|rose|grew)\\s+(?:by\\s+)?(?:₹|rs\\.?|inr)?\\s*${AMOUNT}`,
    ),
  );
  const set = text.match(
    new RegExp(`(?:budget(?:\\s+(?:is|of|to|now|at|around))*|₹|rs\\.?|inr)\\s*(?:₹|rs\\.?|inr)?\\s*${AMOUNT}`),
  );
  const unitAmount = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr)\b/);
  if (shift && brief) {
    const delta = parseAmount(shift[2]!, shift[3]);
    if (delta !== null) {
      const down = /dropped|reduced|cut|decreased|fell|down/.test(shift[1]!);
      updates.totalBudget = Math.max(MIN_BUDGET, brief.totalBudget + (down ? -delta : delta));
    }
  } else if (set) {
    updates.totalBudget = parseAmount(set[1]!, set[2]);
  } else if (unitAmount) {
    updates.totalBudget = parseAmount(unitAmount[1]!, unitAmount[2]);
  } else if (/budget\s+(?:has\s+)?(dropped|reduced|cut|decreased|fell|went down|shrank)/.test(text)) {
    clarifyingQuestion = "By how much did the budget change? A rough figure is fine.";
  }
  if (updates.totalBudget !== null && !TotalBudgetSchema.safeParse(updates.totalBudget).success) {
    // A figure under the minimum is more likely a price than a budget, so it is
    // ignored; one over the maximum was meant as a budget and is worth asking about.
    if (updates.totalBudget > MAX_BUDGET) {
      clarifyingQuestion = `The planner handles budgets up to ${formatInr(MAX_BUDGET)}. What total should it use?`;
    }
    updates.totalBudget = null;
  }
  if (updates.totalBudget !== null) understood.push(`a budget of ${formatInr(updates.totalBudget)}`);

  // Date: explicit ISO date, or a shift such as "two weeks earlier" / "postponed by 10 days".
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const spanFirst = text.match(new RegExp(`${COUNT}\\s+${SPAN}\\s+(earlier|sooner|before|later|after)`));
  const verbFirst = text.match(
    new RegExp(`(postponed|pushed back|delayed|brought forward|moved up|preponed)\\s+(?:by\\s+)?${COUNT}\\s+${SPAN}`),
  );
  const relative = spanFirst
    ? { count: spanFirst[1]!, unit: spanFirst[2]!, direction: spanFirst[3]! }
    : verbFirst
      ? { count: verbFirst[2]!, unit: verbFirst[3]!, direction: verbFirst[1]! }
      : null;
  if (iso) {
    updates.eventDate = iso[1]!;
  } else if (relative && brief) {
    const days = spanDays(relative.count, relative.unit);
    if (days !== null) {
      const earlier = /earlier|sooner|before|brought forward|moved up|preponed/.test(relative.direction);
      updates.eventDate = addDays(brief.eventDate, earlier ? -days : days);
    }
  }
  if (updates.eventDate !== null) {
    if (!IsoDateSchema.safeParse(updates.eventDate).success) {
      updates.eventDate = null;
      clarifyingQuestion = "That date isn't on the calendar. What's the new date?";
    } else if (daysBetween(today, updates.eventDate) <= 0) {
      updates.eventDate = null;
      clarifyingQuestion = "That date would be in the past. What's the new date?";
    } else {
      understood.push(`on ${formatDate(updates.eventDate)}`);
    }
  }

  // "food and photos matter most", "we care most about the venue"
  const emphasis = text.match(
    /([^.;]*?)\b(matters?|are|is)\s+(most|important|the priority|a priority)|care (?:most )?about ([^.;]*)/,
  );
  if (emphasis) {
    // Only the clause right before "matters most" counts, not the whole message.
    // One of the two alternatives always matched, so one of these is filled.
    const clause = (emphasis[1] ?? emphasis[4])!;
    const phrase = clause.slice(clause.lastIndexOf(",") + 1);
    const priorities = PRIORITY_KEYWORDS.filter(([pattern]) => pattern.test(phrase)).map(([, c]) => c);
    if (priorities.length) {
      updates.priorities = priorities.slice(0, 4);
      understood.push(`protect ${priorities.join(" and ")}`);
    }
  }

  if (/\b(simple|intimate|modest|low-key|small)\b/.test(text)) updates.tier = "simple";
  if (/\b(premium|grand|lavish|luxury)\b/.test(text)) updates.tier = "premium";
  if (updates.tier) understood.push(`a ${updates.tier} feel`);

  if (!understood.length && !clarifyingQuestion) {
    clarifyingQuestion =
      "What changed? Mention guests, budget or date with numbers, like “50 more guests” or “2 weeks earlier”.";
  }
  return {
    updates,
    understood: understood.length ? `Understood: ${understood.join(", ")}.` : "I couldn't pick out a specific change.",
    clarifyingQuestion,
  };
}

// --- Ideas -------------------------------------------------------------------

interface IdeaTemplate {
  title: string;
  summary: string;
  details: string[];
  category: CategoryId;
  /** Share of the category's allocation the idea is sized to. */
  share: [number, number];
  types: EventType[];
}

const IDEA_LIBRARY: IdeaTemplate[] = [
  {
    title: "Marigold and brass courtyard",
    summary: "Warm traditional decor built from fresh marigold strings, brass urlis and diyas.",
    details: [
      "Marigold torans at entrances",
      "Floating flowers in brass urlis",
      "Diya-lined walkway",
      "Banana-leaf accents",
    ],
    category: "decor",
    share: [0.6, 0.9],
    types: ["wedding", "anniversary", "community"],
  },
  {
    title: "Regional banana-leaf feast",
    summary: "A sit-down meal on banana leaves featuring dishes from the family's region.",
    details: [
      "Clearly marked vegetarian and Jain options",
      "Two sweets, one regional",
      "Filter coffee or paan counter",
    ],
    category: "catering",
    share: [0.75, 1],
    types: ["wedding", "anniversary", "birthday", "other"],
  },
  {
    title: "Candid storytelling coverage",
    summary: "One candid photographer instead of a large crew, plus a short same-day highlight reel.",
    details: ["Shot list agreed in advance", "Family group photo slot on the run sheet", "Online gallery for guests"],
    category: "photography",
    share: [0.6, 0.95],
    types: ["wedding", "anniversary", "birthday"],
  },
  {
    title: "Pastel garden party",
    summary: "Daytime setup with pastel balloons, paper fans and a photo corner.",
    details: ["Balloon arch at the entrance", "DIY photo-booth props", "Shaded seating for older guests"],
    category: "decor",
    share: [0.5, 0.85],
    types: ["birthday", "other"],
  },
  {
    title: "Activity stations for all ages",
    summary: "Short, supervised activities so children and adults both stay engaged.",
    details: ["Craft table for kids", "Quiz or antakshari round for adults", "Quiet corner with seating"],
    category: "entertainment",
    share: [0.6, 1],
    types: ["birthday", "community", "other"],
  },
  {
    title: "Live chaat and dosa counters",
    summary: "Interactive food counters that double as entertainment and scale with headcount.",
    details: ["Two live counters", "Pre-portioned options for faster service", "Allergen labels at each counter"],
    category: "catering",
    share: [0.7, 1],
    types: ["community", "birthday", "other"],
  },
];

export function ideasFallback({ brief, budget }: IdeasRequest): IdeasResult {
  const allocation = new Map(budget.map((l) => [l.category, l.amount]));
  const ideas = IDEA_LIBRARY.filter((t) => t.types.includes(brief.eventType) && allocation.has(t.category))
    .slice(0, 3)
    .map((t) => {
      const line = allocation.get(t.category)!;
      return {
        title: t.title,
        summary: t.summary,
        whyItFits: `Sized to your ${CATEGORY_META[t.category].label.toLowerCase()} estimate of ${formatInr(line)} for ${brief.guestCount} guests.`,
        details: t.details,
        category: t.category,
        costBreakdown: [
          {
            item: "Overall estimate",
            min: Math.round((line * t.share[0]) / 100) * 100,
            max: Math.round((line * t.share[1]) / 100) * 100,
          },
        ],
        assumptions: [
          "A built-in starting point, not personalised to your notes",
          "Range is a share of your current estimate, not a quote",
        ],
      };
    });
  return { ideas: ideas.map(totalIdeaCost), followUpQuestion: null };
}

// --- Vendor brief --------------------------------------------------------------

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
    questions: [
      "What exactly is included in the quoted price?",
      ...specific.questions,
      "Are taxes and service charges included?",
      "What happens to the price if our guest count changes?",
      "What is the payment schedule, and the cancellation policy?",
    ],
    watchOuts: specific.watchOuts,
  };
}

// --- Run sheet -------------------------------------------------------------------

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
    reminders: [
      "Share this run sheet with family and every vendor the day before.",
      "Keep vendor phone numbers and any balances due today in one place.",
      "Pack an emergency kit: safety pins, medicines, chargers and cash for tips.",
    ],
  };
}
