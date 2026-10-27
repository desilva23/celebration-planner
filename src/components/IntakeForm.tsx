"use client";

import { useRef, useState, type RefObject, type SubmitEvent } from "react";
import type { InterpretResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import { todayIso } from "@/lib/domain/dates";
import { createPlan } from "@/lib/domain/plan";
import type { Plan } from "@/lib/domain/schema";
import { INITIAL, validateIntake, withUpdates, type FieldErrors, type FormState, type Update } from "./intake-form";
import { NotesField, OccasionFields, PriorityChoice, SizeFields, TierChoice } from "./IntakeFields";
import { ErrorMessage, Provenance } from "./ui";

export function IntakeForm({ onCreate }: { onCreate: (plan: Plan) => void }) {
  const today = todayIso();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const errorSummary = useRef<HTMLDivElement>(null);

  const update: Update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const result = validateIntake(form, today);
    setErrors(result.errors);
    if (!result.brief) {
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    onCreate(createPlan(result.brief, today));
  }

  return (
    <div className="intake">
      <h1>Plan a celebration that survives real life</h1>
      <p className="lede">
        Tell us the occasion, budget, guests and date. You get a budget split, a schedule in the right order and a
        vendor checklist, and when something changes the plan adapts instead of starting over.
      </p>

      <DescribeCard today={today} onFill={(updates) => setForm((f) => withUpdates(f, updates))} />

      <form className="card" onSubmit={submit} noValidate aria-labelledby="details-heading">
        <h2 id="details-heading">Event details</h2>
        <ErrorSummary errors={errors} ref={errorSummary} />
        <div className="grid two">
          <OccasionFields form={form} errors={errors} today={today} update={update} />
          <SizeFields form={form} errors={errors} update={update} />
        </div>
        <TierChoice tier={form.tier} update={update} />
        <PriorityChoice eventType={form.eventType} priorities={form.priorities} update={update} />
        <NotesField notes={form.notes} errors={errors} update={update} />

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

/** Plain language in; the AI (or the built-in reader) fills in the form below. */
function DescribeCard({ today, onFill }: { today: string; onFill: (updates: InterpretResult["updates"]) => void }) {
  const [description, setDescription] = useState("");
  const interpret = useAiCall<InterpretResult>("/api/interpret");

  async function fillFromDescription(event: SubmitEvent) {
    event.preventDefault();
    const envelope = await interpret.run({ message: description, brief: null, today });
    if (envelope) onFill(envelope.data.updates);
  }

  return (
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
      <div aria-live="polite" aria-busy={interpret.loading}>
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
  );
}

/** Every problem at once, each linking to its field; it takes focus when the form is refused. */
function ErrorSummary({ errors, ref }: { errors: FieldErrors; ref: RefObject<HTMLDivElement | null> }) {
  const list = Object.entries(errors) as [keyof FormState, string][];
  if (list.length === 0) return null;
  return (
    <div className="callout danger" role="alert" tabIndex={-1} ref={ref}>
      <p>
        <strong>Please fix {list.length === 1 ? "this" : "these"} first:</strong>
      </p>
      <ul>
        {list.map(([field, message]) => (
          <li key={field}>
            <a href={`#field-${field}`}>{message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
