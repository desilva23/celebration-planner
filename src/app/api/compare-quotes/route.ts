import { CompareQuotesRequestSchema } from "@/lib/ai/contracts";
import { compareQuotes } from "@/lib/ai/features";
import { aiRoute } from "@/lib/server/ai-route";

// No fallback: reading free-form quotes needs the model, and guessing would
// risk showing figures the vendor never quoted.
export const POST = aiRoute({
  name: "compare-quotes",
  input: CompareQuotesRequestSchema,
  run: compareQuotes,
});
