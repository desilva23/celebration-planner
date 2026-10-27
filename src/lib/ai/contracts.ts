// Request and response shapes for every AI feature. The same schemas validate
// incoming requests, describe the JSON the model must return, and re-check
// what it actually returned.

import { z } from "zod";
import {
  BudgetLineSchema,
  CategorySchema,
  EventBriefSchema,
  EventTypeSchema,
  GuestCountSchema,
  IsoDateSchema,
  TierSchema,
  TotalBudgetSchema,
} from "../domain/schema";

/** What every AI endpoint returns, so the UI can label where content came from. */
export interface AiEnvelope<T> {
  source: "ai" | "fallback";
  data: T;
  notice?: string;
}

// --- Interpret: natural language → structured brief changes -----------------

export const InterpretRequestSchema = z.object({
  message: z.string().trim().min(1).max(600),
  /** The plan's current brief, or null when the user is just starting. */
  brief: EventBriefSchema.nullable(),
  today: IsoDateSchema,
});

export const InterpretResultSchema = z.object({
  updates: z.object({
    eventType: EventTypeSchema.nullable(),
    title: z.string().max(80).nullable(),
    eventDate: IsoDateSchema.nullable(),
    guestCount: GuestCountSchema.nullable(),
    totalBudget: TotalBudgetSchema.nullable(),
    tier: TierSchema.nullable(),
    city: z.string().max(60).nullable(),
    priorities: z.array(CategorySchema).max(4).nullable(),
    notes: z.string().max(1000).nullable(),
  }),
  /** One-line restatement the user confirms before anything changes. */
  understood: z.string().max(300),
  /** Asked when something important is missing or ambiguous. */
  clarifyingQuestion: z.string().max(200).nullable(),
});

// --- Ideas: personalised concepts with estimated costs ----------------------

const CostRangeSchema = z.object({ min: z.number().int().min(0), max: z.number().int().min(0) });

/** What the model returns for an idea. It itemises costs; it never totals them. */
export const GeneratedIdeaSchema = z.object({
  title: z.string().max(80),
  summary: z.string().max(400),
  whyItFits: z.string().max(300),
  details: z.array(z.string().max(160)).max(6),
  /** The budget line this idea mostly draws on. */
  category: CategorySchema,
  costBreakdown: z
    .array(CostRangeSchema.extend({ item: z.string().max(80) }))
    .min(1)
    .max(6),
  assumptions: z.array(z.string().max(160)).max(4),
});

/** An idea as the app uses it: the estimate is the sum of the breakdown. */
export const IdeaSchema = GeneratedIdeaSchema.extend({ estimatedCost: CostRangeSchema });

export const IdeasRequestSchema = z.object({
  brief: EventBriefSchema,
  budget: z.array(BudgetLineSchema).max(12),
  /** A follow-up like "too expensive" or "needs to suit kids and grandparents". */
  refinement: z.string().trim().max(400).optional(),
  previous: z.array(IdeaSchema).max(4).optional(),
});

export const GeneratedIdeasSchema = z.object({
  ideas: z.array(GeneratedIdeaSchema).min(1).max(4),
  followUpQuestion: z.string().max(200).nullable(),
});

export const IdeasResultSchema = GeneratedIdeasSchema.extend({ ideas: z.array(IdeaSchema).min(1).max(4) });

// --- Vendor brief: what to ask before booking -------------------------------

export const VendorBriefRequestSchema = z.object({
  category: CategorySchema,
  brief: EventBriefSchema,
  budgetForCategory: z.number().int().min(0),
});

export const VendorBriefResultSchema = z.object({
  requirements: z.array(z.string().max(160)).max(6),
  questions: z.array(z.string().max(200)).max(8),
  watchOuts: z.array(z.string().max(160)).max(4),
});

// --- Quote comparison: structure pasted quotes, never invent figures --------

export const CompareQuotesRequestSchema = z.object({
  category: CategorySchema,
  guestCount: GuestCountSchema,
  budgetForCategory: z.number().int().min(0),
  quotes: z
    .array(z.object({ label: z.string().trim().min(1).max(60), text: z.string().trim().min(20).max(3000) }))
    .min(1)
    .max(4),
});

export const QuoteSummarySchema = z.object({
  label: z.string().max(60),
  /** Only figures stated in the quote. Null when the quote doesn't say. */
  total: z.number().int().min(0).nullable(),
  perGuest: z.number().int().min(0).nullable(),
  guestsCovered: z.number().int().min(0).nullable(),
  inclusions: z.array(z.string().max(120)).max(10),
  extraCharges: z.array(z.string().max(120)).max(6),
  /** Minimum guarantees, advances, payment schedule, cancellation rules. */
  terms: z.array(z.string().max(160)).max(6),
  needsClarification: z.array(z.string().max(200)).max(6),
});

export const CompareQuotesResultSchema = z.object({
  quotes: z.array(QuoteSummarySchema).max(4),
});

// --- Run sheet: the day itself, step by step, with who looks after each ----

const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 18:30")
  .describe("24-hour time as HH:MM");

/** Who a step can be assigned to besides the booked vendors. Nobody else can be named. */
export const RUN_SHEET_ROLES = ["Hosts", "Family", "Venue staff", "Everyone"] as const;

export const RunSheetRequestSchema = z.object({
  brief: EventBriefSchema,
  /** When guests are expected. */
  startTime: TimeSchema,
  /** Booked vendors, so steps can say who does them. */
  vendors: z.array(z.object({ category: CategorySchema, name: z.string().trim().min(1).max(80) })).max(20),
});

const RunSheetItemSchema = z.object({
  time: TimeSchema,
  title: z.string().max(80),
  details: z.string().max(200),
  who: z.string().max(80),
});

export const RunSheetResultSchema = z.object({
  items: z.array(RunSheetItemSchema).min(3).max(30),
  reminders: z.array(z.string().max(160)).max(6),
});

/**
 * The result schema for a request, with "who" limited to its booked vendors
 * and the generic roles. Providers decode against it, so the model can't
 * name anyone else, and the reply is validated against it again.
 */
export function runSheetResultFor(vendorNames: string[]) {
  const people = [...new Set([...RUN_SHEET_ROLES, ...vendorNames])] as [string, ...string[]];
  return RunSheetResultSchema.extend({
    items: z
      .array(RunSheetItemSchema.extend({ who: z.enum(people) }))
      .min(3)
      .max(30),
  });
}

export type InterpretRequest = z.infer<typeof InterpretRequestSchema>;
export type InterpretResult = z.infer<typeof InterpretResultSchema>;
export type GeneratedIdea = z.infer<typeof GeneratedIdeaSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
export type IdeasRequest = z.infer<typeof IdeasRequestSchema>;
export type IdeasResult = z.infer<typeof IdeasResultSchema>;
export type VendorBriefRequest = z.infer<typeof VendorBriefRequestSchema>;
export type VendorBriefResult = z.infer<typeof VendorBriefResultSchema>;
export type CompareQuotesRequest = z.infer<typeof CompareQuotesRequestSchema>;
export type QuoteSummary = z.infer<typeof QuoteSummarySchema>;
export type CompareQuotesResult = z.infer<typeof CompareQuotesResultSchema>;
export type RunSheetRequest = z.infer<typeof RunSheetRequestSchema>;
export type RunSheetResult = z.infer<typeof RunSheetResultSchema>;
export type RunSheetRole = (typeof RUN_SHEET_ROLES)[number];
