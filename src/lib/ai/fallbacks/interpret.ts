// Built-in interpreter: reads guests, budget, date, priorities and tone from a
// plain-language message with patterns, one reader per kind of change.

import { addDays, daysBetween } from "../../domain/dates";
import { formatDate, formatInr } from "../../domain/format";
import {
  GuestCountSchema,
  IsoDateSchema,
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  TotalBudgetSchema,
  type CategoryId,
  type EventBrief,
  type EventType,
} from "../../domain/schema";
import type { InterpretRequest, InterpretResult } from "../contracts";
import { AMOUNT, parseAmount, parseCount } from "../numbers";

type Updates = InterpretResult["updates"];

/** What one reader found: changes to make and how to say them back, or a question to ask instead. */
interface Reading {
  updates?: Partial<Updates>;
  understood?: string;
  question?: string;
}

const NO_UPDATES: Updates = {
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

// Capture groups that a pattern always fills when it matches are asserted
// with "!"; optional ones (amount units) are passed on as possibly undefined.
const MORE_GUESTS = new RegExp(`${COUNT}\\s+(more|extra|additional|fewer|less)\\s+${PEOPLE}`);
const GUESTS = new RegExp(`(\\d[\\d,]*)\\s*${PEOPLE}`);
const BUDGET_SHIFT = new RegExp(
  `budget\\s+(?:has\\s+)?(dropped|reduced|cut|decreased|fell|went down|increased|went up|rose|grew)\\s+(?:by\\s+)?(?:₹|rs\\.?|inr)?\\s*${AMOUNT}`,
);
const BUDGET_SET = new RegExp(
  `(?:budget(?:\\s+(?:is|of|to|now|at|around))*|₹|rs\\.?|inr)\\s*(?:₹|rs\\.?|inr)?\\s*${AMOUNT}`,
);
const UNIT_AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr)\b/;
const VAGUE_BUDGET_DROP = /budget\s+(?:has\s+)?(dropped|reduced|cut|decreased|fell|went down|shrank)/;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
const SPAN_FIRST = new RegExp(`${COUNT}\\s+${SPAN}\\s+(earlier|sooner|before|later|after)`);
const VERB_FIRST = new RegExp(
  `(postponed|pushed back|delayed|brought forward|moved up|preponed)\\s+(?:by\\s+)?${COUNT}\\s+${SPAN}`,
);
/** "food and photos matter most", "we care most about the venue" */
const EMPHASIS =
  /([^.;]*?)\b(matters?|are|is)\s+(most|important|the priority|a priority)|care (?:most )?about ([^.;]*)/;

const NOTHING_RECOGNISED =
  "What changed? Mention guests, budget or date with numbers, like “50 more guests” or “2 weeks earlier”.";

export function interpretFallback({ message, brief, today }: InterpretRequest): InterpretResult {
  const text = message.toLowerCase();
  const readings = [
    readEventType(text, brief),
    readGuests(text, brief),
    readBudget(text, brief),
    readDate(text, brief, today),
    readPriorities(text),
    readTier(text),
  ];
  const understood = readings.flatMap((r) => (r.understood ? [r.understood] : []));
  // When more than one reader has a question, the later one is asked.
  const question = readings.reduce<string | null>((asked, r) => r.question ?? asked, null);
  return {
    updates: readings.reduce<Updates>((all, r) => ({ ...all, ...r.updates }), NO_UPDATES),
    understood: understood.length ? `Understood: ${understood.join(", ")}.` : "I couldn't pick out a specific change.",
    clarifyingQuestion: question ?? (understood.length ? null : NOTHING_RECOGNISED),
  };
}

/** The occasion, only when starting a plan: an existing plan keeps its type. */
function readEventType(text: string, brief: EventBrief | null): Reading {
  const eventType = brief ? undefined : EVENT_KEYWORDS.find(([pattern]) => pattern.test(text))?.[1];
  return eventType
    ? { updates: { eventType }, understood: `${/^[aeiou]/.test(eventType) ? "an" : "a"} ${eventType}` }
    : {};
}

/** Relative ("50 more guests") needs a current brief; absolute ("200 guests") doesn't. */
function guestCountIn(text: string, brief: EventBrief | null): number | null {
  const more = text.match(MORE_GUESTS);
  if (more && brief) {
    const n = parseCount(more[1]!);
    return n === null ? null : Math.max(1, brief.guestCount + (/fewer|less/.test(more[2]!) ? -n : n));
  }
  const absolute = text.match(GUESTS);
  return absolute ? parseCount(absolute[1]!) : null;
}

function readGuests(text: string, brief: EventBrief | null): Reading {
  const guestCount = guestCountIn(text, brief);
  if (guestCount === null) return {};
  if (!GuestCountSchema.safeParse(guestCount).success) {
    return {
      question: `How many guests should the plan be for? It handles up to ${MAX_GUESTS.toLocaleString("en-IN")}.`,
    };
  }
  return { updates: { guestCount }, understood: `${guestCount} guests` };
}

/**
 * The budget a message asks for: "budget dropped by 80k", "budget is 8 lakh",
 * "₹5,00,000". "vague" when it says the budget fell but not by how much.
 */
function budgetIn(text: string, brief: EventBrief | null): number | "vague" | null {
  const shift = text.match(BUDGET_SHIFT);
  if (shift && brief) {
    const delta = parseAmount(shift[2]!, shift[3]);
    if (delta === null) return null;
    const down = /dropped|reduced|cut|decreased|fell|down/.test(shift[1]!);
    return Math.max(MIN_BUDGET, brief.totalBudget + (down ? -delta : delta));
  }
  const amount = text.match(BUDGET_SET) ?? text.match(UNIT_AMOUNT);
  if (amount) return parseAmount(amount[1]!, amount[2]);
  return VAGUE_BUDGET_DROP.test(text) ? "vague" : null;
}

function readBudget(text: string, brief: EventBrief | null): Reading {
  const totalBudget = budgetIn(text, brief);
  if (totalBudget === "vague") return { question: "By how much did the budget change? A rough figure is fine." };
  if (totalBudget === null) return {};
  if (!TotalBudgetSchema.safeParse(totalBudget).success) {
    // A figure under the minimum is more likely a price than a budget, so it is
    // ignored; one over the maximum was meant as a budget and is worth asking about.
    // Stryker disable next-line EqualityOperator: exactly the maximum is a valid budget, so it never gets here
    return totalBudget > MAX_BUDGET
      ? { question: `The planner handles budgets up to ${formatInr(MAX_BUDGET)}. What total should it use?` }
      : {};
  }
  return { updates: { totalBudget }, understood: `a budget of ${formatInr(totalBudget)}` };
}

function spanDays(count: string, unit: string): number | null {
  const n = parseCount(count);
  // SPAN only captures day(s), week(s) or month(s).
  return n === null ? null : n * DAYS_PER[unit.replace(/s$/, "") as keyof typeof DAYS_PER];
}

/** "two weeks earlier" or "postponed by 10 days", as a count, a unit and a direction. */
function relativeShift(text: string): { count: string; unit: string; direction: string } | null {
  const spanFirst = text.match(SPAN_FIRST);
  if (spanFirst) return { count: spanFirst[1]!, unit: spanFirst[2]!, direction: spanFirst[3]! };
  const verbFirst = text.match(VERB_FIRST);
  return verbFirst ? { count: verbFirst[2]!, unit: verbFirst[3]!, direction: verbFirst[1]! } : null;
}

/** An explicit ISO date, or a shift relative to the current date. */
function dateIn(text: string, brief: EventBrief | null): string | null {
  const iso = text.match(ISO_DATE);
  if (iso) return iso[1]!;
  const relative = relativeShift(text);
  if (!relative || !brief) return null;
  const days = spanDays(relative.count, relative.unit);
  if (days === null) return null;
  const earlier = /earlier|sooner|before|brought forward|moved up|preponed/.test(relative.direction);
  return addDays(brief.eventDate, earlier ? -days : days);
}

function readDate(text: string, brief: EventBrief | null, today: string): Reading {
  const eventDate = dateIn(text, brief);
  if (eventDate === null) return {};
  if (!IsoDateSchema.safeParse(eventDate).success) {
    return { question: "That date isn't on the calendar. What's the new date?" };
  }
  if (daysBetween(today, eventDate) <= 0) return { question: "That date would be in the past. What's the new date?" };
  return { updates: { eventDate }, understood: `on ${formatDate(eventDate)}` };
}

function readPriorities(text: string): Reading {
  const emphasis = text.match(EMPHASIS);
  if (!emphasis) return {};
  // Only the clause right before "matters most" counts, not the whole message.
  // One of the two alternatives always matched, so one of these is filled.
  const clause = (emphasis[1] ?? emphasis[4])!;
  const phrase = clause.slice(clause.lastIndexOf(",") + 1);
  const priorities = PRIORITY_KEYWORDS.filter(([pattern]) => pattern.test(phrase))
    .map(([, category]) => category)
    .slice(0, 4);
  return priorities.length ? { updates: { priorities }, understood: `protect ${priorities.join(" and ")}` } : {};
}

/** "Grand" wins over "small" when a message says both. */
function readTier(text: string): Reading {
  const tier = /\b(premium|grand|lavish|luxury)\b/.test(text)
    ? "premium"
    : /\b(simple|intimate|modest|low-key|small)\b/.test(text)
      ? "simple"
      : null;
  return tier ? { updates: { tier }, understood: `a ${tier} feel` } : {};
}
