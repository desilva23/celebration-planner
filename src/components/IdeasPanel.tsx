"use client";

import { useState, type SubmitEvent } from "react";
import type { Idea, IdeasResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import { formatInr } from "@/lib/domain/format";
import type { Plan } from "@/lib/domain/schema";
import { categoryLabel, ErrorMessage, Provenance, Section } from "./ui";

/** Compares an idea's estimated range with the user's own budget line. */
function fit(idea: Idea, plan: Plan): { text: string; over: boolean } {
  const line = plan.budget.find((l) => l.category === idea.category);
  const label = categoryLabel(idea.category).toLowerCase();
  if (!line) return { text: `No ${label} line in your budget yet`, over: true };
  const { min, max } = idea.estimatedCost;
  if (max <= line.amount) return { text: `Fits your ${label} budget of ${formatInr(line.amount)}`, over: false };
  if (min > line.amount) return { text: `${formatInr(min - line.amount)}+ over your ${label} budget`, over: true };
  return { text: `May stretch your ${label} budget of ${formatInr(line.amount)}`, over: true };
}

export function IdeasPanel({ plan }: { plan: Plan }) {
  const call = useAiCall<IdeasResult>("/api/ideas");
  const [refinement, setRefinement] = useState("");
  const result = call.envelope?.data;

  function suggest() {
    void call.run({ brief: plan.brief, budget: plan.budget });
  }

  async function refine(event: SubmitEvent) {
    event.preventDefault();
    const done = await call.run({ brief: plan.brief, budget: plan.budget, refinement, previous: result?.ideas });
    if (done) setRefinement("");
  }

  return (
    <Section
      id="ideas"
      title="Ideas that fit"
      intro="Concepts shaped by your guests, preferences and budget. Push back on anything and they’ll be reworked."
    >
      <button type="button" className="button secondary" onClick={suggest} disabled={call.loading}>
        {call.loading ? "Thinking…" : result ? "Start over with fresh ideas" : "Suggest ideas"}
      </button>

      <div aria-live="polite" aria-busy={call.loading}>
        {call.error && <ErrorMessage>{call.error}</ErrorMessage>}
        {call.envelope && result && (
          <>
            <Provenance envelope={call.envelope} />
            <ul className="idea-grid">
              {result.ideas.map((idea) => {
                const { text, over } = fit(idea, plan);
                return (
                  <li key={idea.title} className="idea">
                    <h3>{idea.title}</h3>
                    <p>{idea.summary}</p>
                    <p className="hint">{idea.whyItFits}</p>
                    {idea.details.length > 0 && (
                      <ul>
                        {idea.details.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                    <p className="cost">
                      <span className="badge muted">Estimate</span> {formatInr(idea.estimatedCost.min)}–
                      {formatInr(idea.estimatedCost.max)}
                    </p>
                    <p className={over ? "warn-text" : "ok-text"}>{text}</p>
                    <details>
                      <summary>How this adds up</summary>
                      <ul>
                        {idea.costBreakdown.map((c) => (
                          <li key={c.item}>
                            {c.item}: {c.min === c.max ? formatInr(c.min) : `${formatInr(c.min)}–${formatInr(c.max)}`}
                          </li>
                        ))}
                      </ul>
                      {idea.assumptions.length > 0 && (
                        <>
                          <p className="hint">Based on:</p>
                          <ul>
                            {idea.assumptions.map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>

            <form onSubmit={refine} className="subsection">
              <label htmlFor="refine">What would you change?</label>
              {result.followUpQuestion && (
                <p className="hint" id="refine-hint">
                  {result.followUpQuestion}
                </p>
              )}
              <textarea
                id="refine"
                rows={2}
                maxLength={400}
                placeholder="e.g. Love the first one but it’s too expensive, and it needs to work for kids and grandparents"
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                aria-describedby={result.followUpQuestion ? "refine-hint" : undefined}
              />
              <button type="submit" className="button secondary" disabled={call.loading || !refinement.trim()}>
                {call.loading ? "Reworking…" : "Rework the ideas"}
              </button>
            </form>
          </>
        )}
      </div>
    </Section>
  );
}
