import { InterpretRequestSchema } from "@/lib/ai/contracts";
import { interpretFallback } from "@/lib/ai/fallbacks";
import { interpret } from "@/lib/ai/features";
import { aiRoute } from "@/lib/server/ai-route";

export const POST = aiRoute({
  name: "interpret",
  input: InterpretRequestSchema,
  run: interpret,
  fallback: interpretFallback,
});
