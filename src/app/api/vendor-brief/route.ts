import { VendorBriefRequestSchema } from "@/lib/ai/contracts";
import { vendorBriefFallback } from "@/lib/ai/fallbacks";
import { prepareVendorBrief } from "@/lib/ai/features";
import { aiRoute } from "@/lib/server/ai-route";

export const POST = aiRoute({
  name: "vendor-brief",
  input: VendorBriefRequestSchema,
  run: prepareVendorBrief,
  fallback: vendorBriefFallback,
});
