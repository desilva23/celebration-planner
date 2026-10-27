"use client";

import { BUDGET_WEIGHTS } from "@/lib/domain/assumptions";
import { addDays } from "@/lib/domain/dates";
import { formatInr } from "@/lib/domain/format";
import {
  CATEGORIES,
  EVENT_TYPES,
  MAX_BUDGET,
  MAX_GUESTS,
  MIN_BUDGET,
  TIERS,
  type CategoryId,
  type EventType,
  type Tier,
} from "@/lib/domain/schema";
import type { FieldErrors, FormState, Update } from "./intake-form";
import { categoryLabel, EVENT_TYPE_LABEL } from "./ui";

const TIER_COPY: Record<Tier, string> = {
  simple: "Simple: keep it modest",
  standard: "Standard: comfortable, not lavish",
  premium: "Premium: go big",
};

const PRIORITY_OPTIONS = CATEGORIES.filter((c) => c !== "contingency");
const MAX_PRIORITIES = 4;

/** Props that tie a field to its error message for assistive technology. */
function fieldProps(errors: FieldErrors, key: keyof FormState) {
  return {
    id: `field-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `field-${key}-error` : undefined,
  };
}

function FieldError({ errors, field }: { errors: FieldErrors; field: keyof FormState }) {
  return errors[field] ? (
    <p id={`field-${field}-error`} className="field-error">
      {errors[field]}
    </p>
  ) : null;
}

interface FieldsProps {
  form: FormState;
  errors: FieldErrors;
  update: Update;
}

export function OccasionFields({ form, errors, today, update }: FieldsProps & { today: string }) {
  return (
    <>
      <div className="field">
        <label htmlFor="field-eventType">Occasion</label>
        <select
          {...fieldProps(errors, "eventType")}
          value={form.eventType}
          onChange={(e) => update("eventType", e.target.value as EventType)}
        >
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="field-title">Name for this plan</label>
        <input
          {...fieldProps(errors, "title")}
          type="text"
          maxLength={80}
          placeholder={`${EVENT_TYPE_LABEL[form.eventType]} plan`}
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
        <FieldError errors={errors} field="title" />
      </div>
      <div className="field">
        <label htmlFor="field-eventDate">Event date</label>
        <input
          {...fieldProps(errors, "eventDate")}
          type="date"
          min={addDays(today, 1)}
          required
          value={form.eventDate}
          onChange={(e) => update("eventDate", e.target.value)}
        />
        <FieldError errors={errors} field="eventDate" />
      </div>
      <div className="field">
        <label htmlFor="field-city">City (optional)</label>
        <input
          {...fieldProps(errors, "city")}
          type="text"
          maxLength={60}
          autoComplete="address-level2"
          value={form.city}
          onChange={(e) => update("city", e.target.value)}
        />
        <FieldError errors={errors} field="city" />
      </div>
    </>
  );
}

export function SizeFields({ form, errors, update }: FieldsProps) {
  return (
    <>
      <div className="field">
        <label htmlFor="field-guestCount">Expected guests</label>
        <input
          {...fieldProps(errors, "guestCount")}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_GUESTS}
          required
          value={form.guestCount}
          onChange={(e) => update("guestCount", e.target.value)}
        />
        <FieldError errors={errors} field="guestCount" />
      </div>
      <div className="field">
        <label htmlFor="field-totalBudget">Total budget (₹)</label>
        <input
          {...fieldProps(errors, "totalBudget")}
          type="number"
          inputMode="numeric"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          required
          value={form.totalBudget}
          onChange={(e) => update("totalBudget", e.target.value)}
          aria-describedby={errors.totalBudget ? "field-totalBudget-error" : "budget-readout"}
        />
        <p className="hint" id="budget-readout">
          {Number(form.totalBudget) > 0 ? formatInr(Number(form.totalBudget)) : "In rupees, e.g. 800000 for ₹8 lakh"}
        </p>
        <FieldError errors={errors} field="totalBudget" />
      </div>
    </>
  );
}

export function TierChoice({ tier, update }: { tier: Tier; update: Update }) {
  return (
    <fieldset>
      <legend>What kind of experience?</legend>
      <div className="choice-row">
        {TIERS.map((option) => (
          <label key={option} className="choice">
            <input
              type="radio"
              name="tier"
              value={option}
              checked={tier === option}
              onChange={() => update("tier", option)}
            />
            {TIER_COPY[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PriorityChoice({
  eventType,
  priorities,
  update,
}: {
  eventType: EventType;
  priorities: CategoryId[];
  update: Update;
}) {
  const available = new Set(Object.keys(BUDGET_WEIGHTS[eventType]));
  const toggle = (category: CategoryId, checked: boolean) =>
    update("priorities", checked ? priorities.filter((p) => p !== category) : [...priorities, category]);

  return (
    <fieldset>
      <legend>What matters most? (up to {MAX_PRIORITIES})</legend>
      <p className="hint">These are protected first if the plan has to be cut.</p>
      <div className="choice-row">
        {PRIORITY_OPTIONS.filter((c) => available.has(c)).map((category) => {
          const checked = priorities.includes(category);
          return (
            <label key={category} className="choice">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && priorities.length >= MAX_PRIORITIES}
                onChange={() => toggle(category, checked)}
              />
              {categoryLabel(category)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function NotesField({ notes, errors, update }: { notes: string; errors: FieldErrors; update: Update }) {
  return (
    <div className="field">
      <label htmlFor="field-notes">Anything else we should plan around? (optional)</label>
      <p className="hint" id="notes-hint">
        Guest ages, cultural or religious customs, dietary needs, accessibility, venue limits, the atmosphere you want.
      </p>
      <textarea
        {...fieldProps(errors, "notes")}
        rows={3}
        maxLength={1000}
        value={notes}
        onChange={(e) => update("notes", e.target.value)}
        aria-describedby={errors.notes ? "field-notes-error" : "notes-hint"}
      />
      <FieldError errors={errors} field="notes" />
    </div>
  );
}
