import { RunSheetRequestSchema } from "@/lib/ai/contracts";
import { runSheetFallback } from "@/lib/ai/fallbacks";
import { draftRunSheet } from "@/lib/ai/features";
import { aiRoute } from "@/lib/server/ai-route";

export const POST = aiRoute({
  name: "run-sheet",
  input: RunSheetRequestSchema,
  run: draftRunSheet,
  fallback: runSheetFallback,
});
