import "server-only";
import { AiProviderError, AiResponseError } from "../errors";
import type { Completion } from "../llm";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function model(tier: Completion["tier"]): string {
  return tier === "smart"
    ? process.env.GROQ_MODEL || "openai/gpt-oss-120b"
    : process.env.GROQ_LITE_MODEL || "openai/gpt-oss-20b";
}

/**
 * Groq's OpenAI-compatible chat endpoint. GPT-OSS models support strict
 * structured output (constrained decoding) and reason before answering, so
 * they get a token budget that leaves room for both.
 */
export async function groqComplete(request: Completion): Promise<string> {
  const id = model(request.tier);
  const gptOss = id.startsWith("openai/gpt-oss");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: id,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature,
      max_completion_tokens: 4096,
      ...(gptOss && { reasoning_effort: request.tier === "smart" ? "medium" : "low", include_reasoning: false }),
      response_format: {
        type: "json_schema",
        json_schema: { name: request.name, schema: request.jsonSchema, strict: gptOss },
      },
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.error?.message === "string" ? `: ${body.error.message.slice(0, 200)}` : "";
    throw new AiProviderError(`Groq returned ${response.status}${detail}`, response.status);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiResponseError(`Groq returned no content (finish_reason: ${data?.choices?.[0]?.finish_reason ?? "unknown"})`);
  }
  return content;
}
