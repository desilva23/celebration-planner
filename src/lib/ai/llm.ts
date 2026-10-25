import "server-only";
import type { z } from "zod";
import { AiResponseError, AiUnavailableError } from "./errors";
import { fitToSchema, responseSchemas } from "./json-schema";
import { activeProvider } from "./provider-config";
import { geminiComplete } from "./providers/gemini";
import { groqComplete } from "./providers/groq";

/** "smart" for open-ended generation, "lite" for cheap, fast extraction. */
export type ModelTier = "smart" | "lite";

export interface Completion {
  /** Identifier for the schema, sent to providers that want one. */
  name: string;
  system: string;
  prompt: string;
  jsonSchema: object;
  tier: ModelTier;
  temperature: number;
  signal: AbortSignal;
}

export interface StructuredRequest<S extends z.ZodType> {
  name: string;
  schema: S;
  system: string;
  prompt: string;
  model?: ModelTier;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * Asks the configured provider for JSON matching `schema`, then trims and
 * validates the reply. A malformed reply gets one retry; provider failures
 * and timeouts don't, so a slow upstream can't stack up latency.
 */
export async function generateStructured<S extends z.ZodType>({
  name,
  schema,
  system,
  prompt,
  model = "lite",
  temperature = 0.2,
  timeoutMs = 20_000,
}: StructuredRequest<S>): Promise<z.infer<S>> {
  const provider = activeProvider();
  if (!provider) throw new AiUnavailableError("No AI provider key is set");
  const complete = provider === "groq" ? groqComplete : geminiComplete;
  const { portable, full } = responseSchemas(schema);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete({
      name,
      system,
      prompt,
      jsonSchema: portable,
      tier: model,
      temperature,
      signal: AbortSignal.timeout(timeoutMs),
    });
    try {
      return schema.parse(fitToSchema(JSON.parse(text), full));
    } catch (error) {
      lastError = error;
    }
  }
  throw new AiResponseError("Model output did not match the expected shape", { cause: lastError });
}
