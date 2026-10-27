import type { GeneratedIdea, Idea } from "./contracts";

/**
 * The model itemises an idea's costs and the app adds them up, so the
 * headline estimate can never disagree with its own breakdown. Swapped bounds
 * are straightened out on the way.
 */
export function totalIdeaCost(idea: GeneratedIdea): Idea {
  const costBreakdown = idea.costBreakdown.map((c) => ({
    ...c,
    min: Math.min(c.min, c.max),
    max: Math.max(c.min, c.max),
  }));
  return {
    ...idea,
    costBreakdown,
    estimatedCost: {
      min: costBreakdown.reduce((sum, c) => sum + c.min, 0),
      max: costBreakdown.reduce((sum, c) => sum + c.max, 0),
    },
  };
}
