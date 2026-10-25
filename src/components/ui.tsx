import type { ReactNode } from "react";
import type { AiEnvelope } from "@/lib/ai/contracts";
import { CATEGORY_META } from "@/lib/domain/assumptions";
import type { CategoryId, CostSource, EventType } from "@/lib/domain/schema";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  anniversary: "Anniversary",
  community: "Community event",
  other: "Other celebration",
};

export function categoryLabel(category: CategoryId | "planning"): string {
  return category === "planning" ? "Planning" : CATEGORY_META[category].label;
}

export function SourceBadge({ source }: { source: CostSource }) {
  return source === "confirmed" ? (
    <span className="badge ok">Confirmed</span>
  ) : (
    <span className="badge muted">Estimate</span>
  );
}

/** Says where a piece of generated content came from, so nothing passes as verified. */
export function Provenance({ envelope }: { envelope: AiEnvelope<unknown> }) {
  return (
    <p className="provenance">
      {envelope.source === "ai" ? (
        <span className="badge info">AI suggestion</span>
      ) : (
        <span className="badge muted">Built-in suggestion</span>
      )}{" "}
      {envelope.notice ?? "Check details with vendors before relying on them."}
    </p>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="callout danger" role="alert">
      {children}
    </p>
  );
}

export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {intro && <p className="hint">{intro}</p>}
      {children}
    </section>
  );
}
