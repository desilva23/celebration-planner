import { IdeasRequestSchema } from "@/lib/ai/contracts";
import { ideasFallback } from "@/lib/ai/fallbacks";
import { suggestIdeas } from "@/lib/ai/features";
import { aiRoute } from "@/lib/server/ai-route";

export const POST = aiRoute({
  name: "ideas",
  input: IdeasRequestSchema,
  run: suggestIdeas,
  fallback: ideasFallback,
});
