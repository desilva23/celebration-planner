import { z } from "zod";

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

export const EventTypeSchema = z.enum(EVENT_TYPES);
export const TierSchema = z.enum(TIERS);
export const CategorySchema = z.enum(CATEGORIES);
export const IsoDateSchema = z.iso.date();

export const EventBriefSchema = z.object({
  eventType: EventTypeSchema,
  title: z.string().trim().min(1).max(80),
  eventDate: IsoDateSchema,
  guestCount: z.number().int().min(1).max(5000),
  totalBudget: z.number().int().min(1000).max(100_000_000),
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
export const CostSourceSchema = z.enum(["estimate", "confirmed"]);

export const BudgetLineSchema = z.object({
  category: CategorySchema,
  amount: z.number().int().min(0),
  scalesWithGuests: z.boolean(),
  source: CostSourceSchema,
});

export const TaskSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  category: z.union([CategorySchema, z.literal("planning")]),
  dependsOn: z.array(z.string()),
  startDate: IsoDateSchema,
  dueDate: IsoDateSchema,
  status: z.enum(["todo", "done"]),
  priority: z.enum(["high", "medium", "low"]),
});

export const VendorSchema = z.object({
  id: z.string().min(1).max(40),
  category: CategorySchema,
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(120),
  /** Quoted price as told by the vendor. Null until the user records one. */
  quote: z.number().int().min(0).nullable(),
  status: z.enum(["considering", "quoted", "booked"]),
  notes: z.string().trim().max(500),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  brief: EventBriefSchema,
  budget: z.array(BudgetLineSchema),
  tasks: z.array(TaskSchema),
  vendors: z.array(VendorSchema),
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
export type Vendor = z.infer<typeof VendorSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanChange = z.infer<typeof PlanChangeSchema>;
