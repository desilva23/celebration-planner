"use client";

import type { VendorBriefResult } from "@/lib/ai/contracts";
import { useAiCall } from "@/lib/client/api";
import type { CategoryId, Plan } from "@/lib/domain/schema";
import { categoryLabel, ErrorMessage, Provenance } from "./ui";

/** What to ask vendors of one type before booking, and the hidden costs to watch for. */
export function VendorBrief({
  plan,
  category,
  budgetForCategory,
}: {
  plan: Plan;
  category: CategoryId;
  budgetForCategory: number;
}) {
  const call = useAiCall<VendorBriefResult>("/api/vendor-brief");
  const result = call.envelope?.data;

  return (
    <div className="subsection">
      <button
        type="button"
        className="button secondary"
        disabled={call.loading}
        onClick={() => call.run({ category, brief: plan.brief, budgetForCategory })}
      >
        {call.loading ? "Preparing…" : `What should I ask ${categoryLabel(category).toLowerCase()} vendors?`}
      </button>
      <div aria-live="polite" aria-busy={call.loading}>
        {call.error && <ErrorMessage>{call.error}</ErrorMessage>}
        {call.envelope && result && (
          <div className="proposal">
            <Provenance envelope={call.envelope} />
            <div className="grid three">
              <Column title="What you need" items={result.requirements} />
              <Column title="Questions to ask" items={result.questions} />
              <Column title="Watch out for" items={result.watchOuts} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
