"use client";

import { useRef, useState, type FormEvent } from "react";
import type { InterpretResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import { BUDGET_WEIGHTS } from "@/lib/domain/assumptions";
import { addDays, todayIso } from "@/lib/domain/dates";
import { formatInr } from "@/lib/domain/format";
import { createPlan } from "@/lib/domain/plan";
import {
  CATEGORIES,
  EVENT_TYPES,
  EventBriefSchema,
  TIERS,
  type CategoryId,
  type EventType,
  type Plan,
  type Tier,
} from "@/lib/domain/schema";
import { categoryLabel, ErrorMessage, EVENT_TYPE_LABEL, Provenance } from "./ui";

interface FormState {
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

const INITIAL: FormState = {
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

const TIER_COPY: Record<Tier, string> = {
  simple: "Simple: keep it modest",
  standard: "Standard: comfortable, not lavish",
  premium: "Premium: go big",
};

const FIELD_ERRORS: Partial<Record<keyof FormState, string>> = {
  title: "Give the event a short name (up to 80 characters).",
  eventDate: "Choose the event date.",
  guestCount: "Enter how many guests you expect, between 1 and 5,000.",
  totalBudget: "Enter your total budget in rupees, at least ₹1,000.",
  city: "Keep the city under 60 characters.",
  notes: "Keep notes under 1,000 characters.",
};

const PRIORITY_OPTIONS = CATEGORIES.filter((c) => c !== "contingency");
const MAX_PRIORITIES = 4;

export function IntakeForm({ onCreate }: { onCreate: (plan: Plan) => void }) {
  const today = todayIso();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [description, setDescription] = useState("");
  const interpret = useAiCall<InterpretResult>("/api/interpret");
  const errorSummary = useRef<HTMLDivElement>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function fillFromDescription(event: FormEvent) {
    event.preventDefault();
    const envelope = await interpret.run({ message: description, brief: null, today });
    if (!envelope) return;
    const u = envelope.data.updates;
    setForm((f) => ({
      eventType: u.eventType ?? f.eventType,
      title: u.title ?? f.title,
      eventDate: u.eventDate ?? f.eventDate,
      guestCount: u.guestCount?.toString() ?? f.guestCount,
      totalBudget: u.totalBudget?.toString() ?? f.totalBudget,
      tier: u.tier ?? f.tier,
      city: u.city ?? f.city,
      priorities: u.priorities ?? f.priorities,
      notes: u.notes ?? f.notes,
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = EventBriefSchema.safeParse({
      ...form,
      title: form.title.trim() || `${EVENT_TYPE_LABEL[form.eventType]} plan`,
      guestCount: Number(form.guestCount),
      totalBudget: Number(form.totalBudget),
    });
    const next: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormState;
        next[field] ??= FIELD_ERRORS[field] ?? issue.message;
      }
    }
    if (form.eventDate && form.eventDate <= today) next.eventDate = "Pick a date after today.";
    setErrors(next);
    if (!parsed.success || Object.keys(next).length) {
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    onCreate(createPlan(parsed.data, today));
  }

  const fieldProps = (key: keyof FormState) => ({
    id: `field-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `field-${key}-error` : undefined,
  });
  const fieldError = (key: keyof FormState) =>
    errors[key] ? (
      <p id={`field-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    ) : null;

  const availableCategories = new Set(Object.keys(BUDGET_WEIGHTS[form.eventType]));
  const errorList = Object.entries(errors) as [keyof FormState, string][];

  return (
    <div className="intake">
      <h1>Plan a celebration that survives real life</h1>
      <p className="lede">
        Tell us the occasion, budget, guests and date. You get a budget split, a schedule in the right order and a vendor
        checklist, and when something changes the plan adapts instead of starting over.
      </p>

      <section className="card" aria-labelledby="describe-heading">
        <h2 id="describe-heading">Describe it in your own words</h2>
        <form onSubmit={fillFromDescription}>
          <label htmlFor="describe">What are you planning?</label>
          <p className="hint" id="describe-hint">
            For example: “My parents’ 30th anniversary in Coimbatore on 14 Feb, about 80 guests, ₹3 lakh, mostly elderly
            relatives, vegetarian food.”
          </p>
          <textarea
            id="describe"
            rows={3}
            maxLength={600}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby="describe-hint"
          />
          <button type="submit" className="button secondary" disabled={interpret.loading || !description.trim()}>
            {interpret.loading ? "Reading…" : "Fill in the details below"}
          </button>
        </form>
        <div aria-live="polite">
          {interpret.error && <ErrorMessage>{interpret.error}</ErrorMessage>}
          {interpret.envelope && !interpret.loading && (
            <div className="proposal">
              <Provenance envelope={interpret.envelope} />
              <p>{interpret.envelope.data.understood} Check the details below before building the plan.</p>
              {interpret.envelope.data.clarifyingQuestion && (
                <p className="callout info">{interpret.envelope.data.clarifyingQuestion}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <form className="card" onSubmit={submit} noValidate aria-labelledby="details-heading">
        <h2 id="details-heading">Event details</h2>

        {errorList.length > 0 && (
          <div className="callout danger" role="alert" tabIndex={-1} ref={errorSummary}>
            <p>
              <strong>Please fix {errorList.length === 1 ? "this" : "these"} first:</strong>
            </p>
            <ul>
              {errorList.map(([field, message]) => (
                <li key={field}>
                  <a href={`#field-${field}`}>{message}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid two">
          <div className="field">
            <label htmlFor="field-eventType">Occasion</label>
            <select
              {...fieldProps("eventType")}
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
              {...fieldProps("title")}
              type="text"
              maxLength={80}
              placeholder={`${EVENT_TYPE_LABEL[form.eventType]} plan`}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
            {fieldError("title")}
          </div>
          <div className="field">
            <label htmlFor="field-eventDate">Event date</label>
            <input
              {...fieldProps("eventDate")}
              type="date"
              min={addDays(today, 1)}
              required
              value={form.eventDate}
              onChange={(e) => update("eventDate", e.target.value)}
            />
            {fieldError("eventDate")}
          </div>
          <div className="field">
            <label htmlFor="field-city">City (optional)</label>
            <input
              {...fieldProps("city")}
              type="text"
              maxLength={60}
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
            {fieldError("city")}
          </div>
          <div className="field">
            <label htmlFor="field-guestCount">Expected guests</label>
            <input
              {...fieldProps("guestCount")}
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              required
              value={form.guestCount}
              onChange={(e) => update("guestCount", e.target.value)}
            />
            {fieldError("guestCount")}
          </div>
          <div className="field">
            <label htmlFor="field-totalBudget">Total budget (₹)</label>
            <input
              {...fieldProps("totalBudget")}
              type="number"
              inputMode="numeric"
              min={1000}
              required
              value={form.totalBudget}
              onChange={(e) => update("totalBudget", e.target.value)}
              aria-describedby={errors.totalBudget ? "field-totalBudget-error" : "budget-readout"}
            />
            <p className="hint" id="budget-readout">
              {Number(form.totalBudget) > 0 ? formatInr(Number(form.totalBudget)) : "In rupees, e.g. 800000 for ₹8 lakh"}
            </p>
            {fieldError("totalBudget")}
          </div>
        </div>

        <fieldset>
          <legend>What kind of experience?</legend>
          <div className="choice-row">
            {TIERS.map((tier) => (
              <label key={tier} className="choice">
                <input
                  type="radio"
                  name="tier"
                  value={tier}
                  checked={form.tier === tier}
                  onChange={() => update("tier", tier)}
                />
                {TIER_COPY[tier]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>What matters most? (up to {MAX_PRIORITIES})</legend>
          <p className="hint">These are protected first if the plan has to be cut.</p>
          <div className="choice-row">
            {PRIORITY_OPTIONS.filter((c) => availableCategories.has(c)).map((category) => {
              const checked = form.priorities.includes(category);
              return (
                <label key={category} className="choice">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && form.priorities.length >= MAX_PRIORITIES}
                    onChange={() =>
                      update(
                        "priorities",
                        checked ? form.priorities.filter((p) => p !== category) : [...form.priorities, category],
                      )
                    }
                  />
                  {categoryLabel(category)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="field-notes">Anything else we should plan around? (optional)</label>
          <p className="hint" id="notes-hint">
            Guest ages, cultural or religious customs, dietary needs, accessibility, venue limits, the atmosphere you want.
          </p>
          <textarea
            {...fieldProps("notes")}
            rows={3}
            maxLength={1000}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            aria-describedby={errors.notes ? "field-notes-error" : "notes-hint"}
          />
          {fieldError("notes")}
        </div>

        <button type="submit" className="button primary">
          Build my plan
        </button>
        <p className="hint">
          Your plan is saved in this browser only. Budget figures start as planning estimates, not vendor prices.
        </p>
      </form>
    </div>
  );
}
