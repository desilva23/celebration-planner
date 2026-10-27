// The intake form's state and rules, kept apart from its markup.

import type { z } from "zod";
import type { InterpretResult } from "@/lib/ai/contracts";
import { formatInr } from "@/lib/domain/format";
import {
  EventBriefSchema,
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  type CategoryId,
  type EventBrief,
  type EventType,
  type Tier,
} from "@/lib/domain/schema";
import { EVENT_TYPE_LABEL } from "./ui";

export interface FormState {
  eventType: EventType;
  title: string;
  eventDate: string;
  guestCount: string;
  totalBudget: string;
  tier: Tier;
  city: string;
  priorities: CategoryId[];
  notes: string;
}

export type FieldErrors = Partial<Record<keyof FormState, string>>;
export type Update = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

export const INITIAL: FormState = {
  eventType: "wedding",
  title: "",
  eventDate: "",
  guestCount: "",
  totalBudget: "",
  tier: "standard",
  city: "",
  priorities: [],
  notes: "",
};

const FIELD_ERRORS: FieldErrors = {
  title: "Give the event a short name (up to 80 characters).",
  eventDate: "Choose the event date.",
  guestCount: `Enter how many guests you expect, between 1 and ${MAX_GUESTS.toLocaleString("en-IN")}.`,
  totalBudget: `Enter your total budget in rupees, between ${formatInr(MIN_BUDGET)} and ${formatInr(MAX_BUDGET)}.`,
  city: "Keep the city under 60 characters.",
  notes: "Keep notes under 1,000 characters.",
};

/** One plain-language message per field: the first problem found for each. */
function fieldErrors(issues: z.ZodError["issues"]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0] as keyof FormState;
    errors[field] ??= FIELD_ERRORS[field] ?? issue.message;
  }
  return errors;
}

/** The brief the form describes, or what to fix first. */
export function validateIntake(form: FormState, today: string): { brief: EventBrief | null; errors: FieldErrors } {
  const parsed = EventBriefSchema.safeParse({
    ...form,
    title: form.title.trim() || `${EVENT_TYPE_LABEL[form.eventType]} plan`,
    guestCount: Number(form.guestCount),
    totalBudget: Number(form.totalBudget),
  });
  const errors = fieldErrors(parsed.error?.issues ?? []);
  if (form.eventDate && form.eventDate <= today) errors.eventDate = "Pick a date after today.";
  return { brief: parsed.success && Object.keys(errors).length === 0 ? parsed.data : null, errors };
}

/** The form with every field a description filled in; fields it didn't mention stay as they were. */
export function withUpdates(form: FormState, updates: InterpretResult["updates"]): FormState {
  const asFormValues = {
    ...updates,
    guestCount: updates.guestCount?.toString() ?? null,
    totalBudget: updates.totalBudget?.toString() ?? null,
  };
  // The updates use the form's field names and value types; only the numbers needed converting.
  const filled = Object.fromEntries(Object.entries(asFormValues).filter(([, value]) => value !== null));
  return { ...form, ...(filled as Partial<FormState>) };
}
