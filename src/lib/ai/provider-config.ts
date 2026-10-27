// Which AI provider serves requests. Kept free of SDK imports so pages can
// read it cheaply.

export type Provider = "gemini" | "groq";

export const PROVIDER_LABEL: Record<Provider, string> = { gemini: "Gemini", groq: "Groq" };

/**
 * Whichever key is set is used, preferring Gemini when both are, unless
 * AI_PROVIDER says groq.
 */
export function activeProvider(env: Record<string, string | undefined> = process.env): Provider | null {
  const preferred = env.AI_PROVIDER?.trim().toLowerCase();
  if (preferred === "groq" && env.GROQ_API_KEY) return "groq";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.GROQ_API_KEY) return "groq";
  return null;
}
