// Built-in ideas: a small library sized to the user's own budget lines.

import { CATEGORY_META } from "../../domain/assumptions";
import { formatInr } from "../../domain/format";
import type { CategoryId, EventType } from "../../domain/schema";
import type { IdeasRequest, IdeasResult } from "../contracts";
import { totalIdeaCost } from "../idea-cost";

interface IdeaTemplate {
  title: string;
  summary: string;
  details: string[];
  category: CategoryId;
  /** Share of the category's allocation the idea is sized to. */
  share: [number, number];
  types: EventType[];
}

// Stryker disable StringLiteral: wording of built-in suggestions; tests check their structure and the contracts, not copy
const IDEA_LIBRARY: IdeaTemplate[] = [
  {
    title: "Marigold and brass courtyard",
    summary: "Warm traditional decor built from fresh marigold strings, brass urlis and diyas.",
    details: [
      "Marigold torans at entrances",
      "Floating flowers in brass urlis",
      "Diya-lined walkway",
      "Banana-leaf accents",
    ],
    category: "decor",
    share: [0.6, 0.9],
    types: ["wedding", "anniversary", "community"],
  },
  {
    title: "Regional banana-leaf feast",
    summary: "A sit-down meal on banana leaves featuring dishes from the family's region.",
    details: [
      "Clearly marked vegetarian and Jain options",
      "Two sweets, one regional",
      "Filter coffee or paan counter",
    ],
    category: "catering",
    share: [0.75, 1],
    types: ["wedding", "anniversary", "birthday", "other"],
  },
  {
    title: "Candid storytelling coverage",
    summary: "One candid photographer instead of a large crew, plus a short same-day highlight reel.",
    details: ["Shot list agreed in advance", "Family group photo slot on the run sheet", "Online gallery for guests"],
    category: "photography",
    share: [0.6, 0.95],
    types: ["wedding", "anniversary", "birthday"],
  },
  {
    title: "Pastel garden party",
    summary: "Daytime setup with pastel balloons, paper fans and a photo corner.",
    details: ["Balloon arch at the entrance", "DIY photo-booth props", "Shaded seating for older guests"],
    category: "decor",
    share: [0.5, 0.85],
    types: ["birthday", "other"],
  },
  {
    title: "Activity stations for all ages",
    summary: "Short, supervised activities so children and adults both stay engaged.",
    details: ["Craft table for kids", "Quiz or antakshari round for adults", "Quiet corner with seating"],
    category: "entertainment",
    share: [0.6, 1],
    types: ["birthday", "community", "other"],
  },
  {
    title: "Live chaat and dosa counters",
    summary: "Interactive food counters that double as entertainment and scale with headcount.",
    details: ["Two live counters", "Pre-portioned options for faster service", "Allergen labels at each counter"],
    category: "catering",
    share: [0.7, 1],
    types: ["community", "birthday", "other"],
  },
];
// Stryker restore StringLiteral

export function ideasFallback({ brief, budget }: IdeasRequest): IdeasResult {
  const allocation = new Map(budget.map((l) => [l.category, l.amount]));
  const ideas = IDEA_LIBRARY.filter((t) => t.types.includes(brief.eventType) && allocation.has(t.category))
    .slice(0, 3)
    .map((t) => {
      const line = allocation.get(t.category)!;
      return {
        title: t.title,
        summary: t.summary,
        whyItFits: `Sized to your ${CATEGORY_META[t.category].label.toLowerCase()} estimate of ${formatInr(line)} for ${brief.guestCount} guests.`,
        details: t.details,
        category: t.category,
        costBreakdown: [
          {
            // Stryker disable next-line StringLiteral: wording
            item: "Overall estimate",
            min: Math.round((line * t.share[0]) / 100) * 100,
            max: Math.round((line * t.share[1]) / 100) * 100,
          },
        ],
        // Stryker disable StringLiteral: wording
        assumptions: [
          "A built-in starting point, not personalised to your notes",
          "Range is a share of your current estimate, not a quote",
        ],
        // Stryker restore StringLiteral
      };
    });
  return { ideas: ideas.map(totalIdeaCost), followUpQuestion: null };
}
