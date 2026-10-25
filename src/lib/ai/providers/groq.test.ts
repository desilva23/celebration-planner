import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, AiResponseError } from "../errors";
import type { Completion } from "../llm";
import { groqComplete } from "./groq";

const fetchMock = vi.fn<typeof fetch>();

const completion = (overrides: Partial<Completion> = {}): Completion => ({
  name: "test_result",
  system: "system rules",
  prompt: "user prompt",
  jsonSchema: { type: "object" },
  tier: "lite",
  temperature: 0.2,
  signal: new AbortController().signal,
  ...overrides,
});

const reply = (content: unknown, finishReason = "stop") =>
  Response.json({ choices: [{ message: { content }, finish_reason: finishReason }] });

const sent = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string);

describe("groqComplete", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("GROQ_MODEL", "");
    vi.stubEnv("GROQ_LITE_MODEL", "");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => reply("{}"));
  });

  it("sends the prompt as chat messages with a strict schema and the abort signal", async () => {
    const request = completion();
    await expect(groqComplete(request)).resolves.toBe("{}");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBe(request.signal);
    expect(sent()).toEqual({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: "system rules" },
        { role: "user", content: "user prompt" },
      ],
      temperature: 0.2,
      max_completion_tokens: 4096,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: "test_result", schema: { type: "object" }, strict: true },
      },
    });
  });

  it("reasons harder with the larger model for smart requests", async () => {
    await groqComplete(completion({ tier: "smart" }));
    expect(sent()).toMatchObject({ model: "openai/gpt-oss-120b", reasoning_effort: "medium" });
  });

  it("drops the reasoning options and strict mode for models that don't support them", async () => {
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    vi.stubEnv("GROQ_LITE_MODEL", "llama-3.1-8b-instant");
    await groqComplete(completion({ tier: "smart" }));
    await groqComplete(completion({ tier: "lite" }));
    for (const [call, model] of [
      [0, "llama-3.3-70b-versatile"],
      [1, "llama-3.1-8b-instant"],
    ] as const) {
      expect(sent(call).model).toBe(model);
      expect(sent(call)).not.toHaveProperty("reasoning_effort");
      expect(sent(call).response_format.json_schema.strict).toBe(false);
    }
  });

  it("reports the provider's own error message, trimmed, with the status", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "x".repeat(300) } }, { status: 429 }));
    const error: unknown = await groqComplete(completion()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ status: 429, message: `Groq returned 429: ${"x".repeat(200)}` });
  });

  it.each([
    ["isn't JSON", () => new Response("Bad gateway", { status: 502 }), 502],
    ["has no message", () => Response.json({ error: { code: 42 } }, { status: 500 }), 500],
  ])("still reports the status when the error body %s", async (_, response, status) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(groqComplete(completion())).rejects.toMatchObject({
      name: "AiProviderError",
      message: `Groq returned ${status}`,
      status,
    });
  });

  it.each([
    ["blank content", () => reply("   ", "length"), "length"],
    ["null content", () => reply(null, "content_filter"), "content_filter"],
    ["no choices", () => Response.json({}), "unknown"],
    ["a null body", () => Response.json(null), "unknown"],
  ])("rejects a reply with %s, saying why the model stopped", async (_, response, reason) => {
    fetchMock.mockResolvedValueOnce(response());
    const error: unknown = await groqComplete(completion()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiResponseError);
    expect((error as Error).message).toBe(`Groq returned no content (finish_reason: ${reason})`);
  });
});
