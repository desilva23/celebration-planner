import "server-only";
import { AiProviderError, AiResponseError } from "../errors";
import type { Completion } from "../llm";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** The parts of a Groq reply this client reads. All optional: error bodies vary. */
interface GroqReply {
  error?: { message?: unknown };
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
}

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
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chatRequest(request)),
    signal: request.signal,
  });
  if (!response.ok) throw await providerError(response);
  return contentOf((await response.json()) as GroqReply | null);
}

/** The chat completion Groq is asked for. */
function chatRequest(request: Completion) {
  const id = model(request.tier);
  const gptOss = id.startsWith("openai/gpt-oss");
  return {
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
  };
}

/** Groq's own explanation of a failed request, trimmed, with the status. */
async function providerError(response: Response): Promise<AiProviderError> {
  const body = (await response.json().catch(() => null)) as GroqReply | null;
  const message = body?.error?.message;
  const detail = typeof message === "string" ? `: ${message.slice(0, 200)}` : "";
  return new AiProviderError(`Groq returned ${response.status}${detail}`, response.status);
}

/** The reply text, or an error saying why there wasn't any. */
function contentOf(data: GroqReply | null): string {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiResponseError(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  }
  return content;
}
