import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "../zod";
import { InterpretResultSchema } from "./contracts";
import { AiProviderError, AiResponseError, AiUnavailableError } from "./errors";
import { generateStructured } from "./llm";
import { geminiComplete } from "./providers/gemini";

vi.mock("./providers/gemini", () => ({ geminiComplete: vi.fn() }));

const validReply = {
  updates: {
    eventType: null,
    title: null,
    eventDate: null,
    guestCount: 250,
    totalBudget: null,
    tier: null,
    city: null,
    priorities: null,
    notes: null,
  },
  understood: "250 guests.",
  clarifyingQuestion: null,
};

function groqReply(content: string, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200 ? { choices: [{ message: { content }, finish_reason: "stop" }] } : { error: { message: content } },
    ),
    { status, headers: { "content-type": "application/json" } },
  );
}

const request = { name: "interpret_result", schema: InterpretResultSchema, system: "sys", prompt: "50 more guests" };

describe("generateStructured with Gemini", () => {
  const complete = vi.mocked(geminiComplete);

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("AI_PROVIDER", "");
    complete.mockReset();
  });

  it("sends the portable schema with default settings and validates the reply", async () => {
    complete.mockResolvedValueOnce(JSON.stringify(validReply));
    await expect(generateStructured(request)).resolves.toEqual(validReply);
    const [completion] = complete.mock.calls[0]!;
    expect(completion).toMatchObject({
      name: "interpret_result",
      system: "sys",
      prompt: "50 more guests",
      tier: "lite",
      temperature: 0.2,
    });
    expect(completion.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(completion.jsonSchema)).not.toMatch(/maxLength|\$schema/);
  });

  it("passes the requested tier and temperature through", async () => {
    complete.mockResolvedValueOnce(JSON.stringify(validReply));
    await generateStructured({ ...request, model: "smart", temperature: 0.8, timeoutMs: 30_000 });
    expect(complete.mock.calls[0]![0]).toMatchObject({ tier: "smart", temperature: 0.8 });
  });

  it("trims an over-long reply instead of rejecting it", async () => {
    complete.mockResolvedValueOnce(JSON.stringify({ ...validReply, understood: "u".repeat(500) }));
    const result = await generateStructured(request);
    expect(result.understood).toHaveLength(300);
  });

  it("keeps the last validation failure as the cause when it gives up", async () => {
    complete.mockResolvedValue(JSON.stringify({ understood: 42 }));
    const error: unknown = await generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiResponseError);
    expect((error as AiResponseError).cause).toBeInstanceOf(z.ZodError);
  });
});

describe("generateStructured with Groq", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks for strict structured output and returns the validated reply", async () => {
    fetchMock.mockResolvedValueOnce(groqReply(JSON.stringify(validReply)));
    await expect(generateStructured(request)).resolves.toEqual(validReply);

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format.json_schema).toMatchObject({ name: "interpret_result", strict: true });
    expect(JSON.stringify(body.response_format.json_schema.schema)).not.toMatch(/maxLength|\$schema/);
  });

  it("retries once when the reply doesn't validate", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply('{"nope": true}'))
      .mockResolvedValueOnce(groqReply(JSON.stringify(validReply)));
    await expect(generateStructured(request)).resolves.toEqual(validReply);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second bad reply", async () => {
    fetchMock.mockImplementation(async () => groqReply("not json"));
    await expect(generateStructured(request)).rejects.toThrow(
      new AiResponseError("Model output did not match the expected shape"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces provider errors without retrying", async () => {
    fetchMock.mockResolvedValueOnce(groqReply("Invalid API Key", 401));
    const error = await generateStructured(request).catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(generateStructured(request)).rejects.toThrow(new AiUnavailableError("No AI provider key is set"));
  });
});
