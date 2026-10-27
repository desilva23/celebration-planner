// Built-in ideas: picks from the library and sizes each to the user's own budget line.

import { CATEGORY_META } from "../../domain/assumptions";
import { formatInr } from "../../domain/format";
import type { IdeasRequest, IdeasResult } from "../contracts";
import { totalIdeaCost } from "../idea-cost";
import { ESTIMATE_ITEM, IDEA_ASSUMPTIONS, IDEA_LIBRARY } from "./ideas.data";

export function ideasFallback({ brief, budget }: IdeasRequest): IdeasResult {
  const allocation = new Map(budget.map((l) => [l.category, l.amount]));
  const suited = IDEA_LIBRARY.flatMap((template) => {
    const line = allocation.get(template.category);
    return line !== undefined && template.types.includes(brief.eventType) ? [{ template, line }] : [];
  });
  const ideas = suited.slice(0, 3).map(({ template: t, line }) => ({
    title: t.title,
    summary: t.summary,
    whyItFits: `Sized to your ${CATEGORY_META[t.category].label.toLowerCase()} estimate of ${formatInr(line)} for ${brief.guestCount} guests.`,
    details: t.details,
    category: t.category,
    costBreakdown: [
      {
        item: ESTIMATE_ITEM,
        min: Math.round((line * t.share[0]) / 100) * 100,
        max: Math.round((line * t.share[1]) / 100) * 100,
      },
    ],
    assumptions: [...IDEA_ASSUMPTIONS],
  }));
  return { ideas: ideas.map(totalIdeaCost), followUpQuestion: null };
}
