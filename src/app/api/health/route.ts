import { activeProvider } from "@/lib/ai/provider-config";

export function GET(): Response {
  return Response.json({ ok: true, ai: activeProvider() });
}
