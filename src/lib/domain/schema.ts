import { z } from "../zod";

export const EVENT_TYPES = ["wedding", "birthday", "anniversary", "community", "other"] as const;
export const TIERS = ["simple", "standard", "premium"] as const;
export const CATEGORIES = [
  "venue",
  "catering",
  "decor",
  "photography",
  "entertainment",
  "attire",
  "invitations",
  "transport",
  "contingency",
] as const;

export const MAX_GUESTS = 5000;
export const MIN_BUDGET = 1000;
export const MAX_BUDGET = 100_000_000;

export const EventTypeSchema = z.enum(EVENT_TYPES);
export const TierSchema = z.enum(TIERS);
export const CategorySchema = z.enum(CATEGORIES);
export const IsoDateSchema = z.iso.date();
export const GuestCountSchema = z.number().int().min(1).max(MAX_GUESTS);
export const TotalBudgetSchema = z.number().int().min(MIN_BUDGET).max(MAX_BUDGET);

export const EventBriefSchema = z.object({
  eventType: EventTypeSchema,
  title: z.string().trim().min(1).max(80),
  eventDate: IsoDateSchema,
  guestCount: GuestCountSchema,
  totalBudget: TotalBudgetSchema,
  tier: TierSchema,
  city: z.string().trim().max(60),
  /** Categories the user wants protected when the plan has to be cut. */
  priorities: z.array(CategorySchema).max(4),
  /** Free-text preferences: culture, dietary needs, accessibility, atmosphere. */
  notes: z.string().trim().max(1000),
});

/**
 * "estimate" = derived from planning assumptions or AI suggestions.
 * "confirmed" = a price the user has agreed with a real vendor.
 */
const CostSourceSchema = z.enum(["estimate", "confirmed"]);

export const BudgetLineSchema = z.object({
  category: CategorySchema,
  amount: z.number().int().min(0),
  scalesWithGuests: z.boolean(),
  source: CostSourceSchema,
});

const TaskSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  category: z.union([CategorySchema, z.literal("planning")]),
  dependsOn: z.array(z.string()),
  startDate: IsoDateSchema,
  dueDate: IsoDateSchema,
  status: z.enum(["todo", "done"]),
  priority: z.enum(["high", "medium", "low"]),
});

/** Money owed to a vendor on a date, such as an advance or the balance. */
export const PaymentSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  amount: z.number().int().min(1).max(MAX_BUDGET),
  dueDate: IsoDateSchema,
  paid: z.boolean(),
});

const VendorSchema = z.object({
  id: z.string().min(1).max(40),
  category: CategorySchema,
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(120),
  /** Quoted price as told by the vendor. Null until the user records one. */
  quote: z.number().int().min(0).nullable(),
  status: z.enum(["considering", "quoted", "booked"]),
  notes: z.string().trim().max(500),
  /** Added after plans were first saved, so older plans load with none. */
  payments: z.array(PaymentSchema).max(20).default([]),
});

/** One invitation: a household or group, how many people it covers, and their reply. */
export const GuestSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  partySize: z.number().int().min(1).max(50),
  rsvp: z.enum(["pending", "yes", "no"]),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  brief: EventBriefSchema,
  budget: z.array(BudgetLineSchema),
  tasks: z.array(TaskSchema),
  vendors: z.array(VendorSchema),
  /** Added after plans were first saved, so older plans load with an empty list. */
  guests: z.array(GuestSchema).max(2000).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** The parts of a brief that can change after a plan exists. */
export const PlanChangeSchema = EventBriefSchema.pick({
  guestCount: true,
  totalBudget: true,
  eventDate: true,
  tier: true,
  priorities: true,
}).partial();

export type EventType = z.infer<typeof EventTypeSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type CategoryId = z.infer<typeof CategorySchema>;
export type EventBrief = z.infer<typeof EventBriefSchema>;
export type CostSource = z.infer<typeof CostSourceSchema>;
export type BudgetLine = z.infer<typeof BudgetLineSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type Guest = z.infer<typeof GuestSchema>;
export type Rsvp = Guest["rsvp"];
export type Plan = z.infer<typeof PlanSchema>;
export type PlanChange = z.infer<typeof PlanChangeSchema>;
