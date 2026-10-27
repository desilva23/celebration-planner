"use client";

import { useState, type SubmitEvent } from "react";
import type { RunSheetResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import type { EventType, Plan } from "@/lib/domain/schema";
import { ErrorMessage, Provenance, Section } from "./ui";

/** When guests usually arrive, as a starting point to change. */
const USUAL_START: Record<EventType, string> = {
  wedding: "18:00",
  birthday: "17:00",
  anniversary: "19:00",
  community: "10:00",
  other: "18:00",
};

/** A timetable for the day itself, drafted from the plan and its booked vendors. */
export function RunSheetPanel({ plan }: { plan: Plan }) {
  const call = useAiCall<RunSheetResult>("/api/run-sheet");
  const [startTime, setStartTime] = useState(USUAL_START[plan.brief.eventType]);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const sheet = call.envelope?.data;

  function draft(event: SubmitEvent) {
    event.preventDefault();
    setCopied(null);
    const vendors = plan.vendors.filter((v) => v.status === "booked").map(({ category, name }) => ({ category, name }));
    void call.run({ brief: plan.brief, startTime, vendors });
  }

  async function copy(result: RunSheetResult) {
    const text = [
      `${plan.brief.title}: run sheet`,
      ...result.items.map((item) => `${item.time}  ${item.title} (${item.who}). ${item.details}`),
      ...(result.reminders.length ? ["", "Reminders:", ...result.reminders.map((r) => `- ${r}`)] : []),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Section
      id="on-the-day"
      title="On the day"
      intro="A timetable for the day itself: what happens when, and who looks after each step. Share it with family and vendors the day before."
    >
      <form onSubmit={draft} className="inline-form">
        <label htmlFor="run-sheet-start">Guests arrive at</label>
        <input
          id="run-sheet-start"
          type="time"
          required
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <button type="submit" className="button secondary" disabled={call.loading || !startTime}>
          {call.loading ? "Drafting…" : sheet ? "Draft again" : "Draft a run sheet"}
        </button>
      </form>
      <div aria-live="polite">
        {call.error && <ErrorMessage>{call.error}</ErrorMessage>}
        {call.envelope && sheet && (
          <>
            <Provenance envelope={call.envelope} />
            <div className="table-wrap">
              <table>
                <caption>Run sheet for {plan.brief.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">What</th>
                    <th scope="col">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.time}</td>
                      <th scope="row">
                        {item.title}
                        <span className="hint block">{item.details}</span>
                      </th>
                      <td>{item.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.reminders.length > 0 && (
              <>
                <h3>Reminders</h3>
                <ul>
                  {sheet.reminders.map((reminder, i) => (
                    <li key={i}>{reminder}</li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="button ghost small" onClick={() => void copy(sheet)}>
              Copy as text
            </button>
            {copied === "yes" && <p className="hint">Copied. Paste it into a message or a document.</p>}
            {copied === "failed" && (
              <p className="hint">Couldn’t copy automatically. Select the table and copy it instead.</p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
