import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterpretResultSchema } from "./contracts";
import { AiProviderError, AiResponseError, AiUnavailableError } from "./errors";
import { generateStructured } from "./llm";
import { activeProvider } from "./provider-config";

const validReply = {
  updates: {
    eventType: null, title: null, eventDate: null, guestCount: 250, totalBudget: null,
    tier: null, city: null, priorities: null, notes: null,
  },
  understood: "250 guests.",
  clarifyingQuestion: null,
};

function groqReply(content: string, status = 200) {
  return new Response(
    JSON.stringify(status === 200 ? { choices: [{ message: { content }, finish_reason: "stop" }] } : { error: { message: content } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const request = { name: "interpret_result", schema: InterpretResultSchema, system: "sys", prompt: "50 more guests" };

describe("activeProvider", () => {
  it("uses whichever key is set, and AI_PROVIDER when both are", () => {
    expect(activeProvider({})).toBeNull();
    expect(activeProvider({ GROQ_API_KEY: "k" })).toBe("groq");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k" })).toBe("gemini");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AI_PROVIDER: "groq" })).toBe("groq");
    expect(activeProvider({ GEMINI_API_KEY: "k", AI_PROVIDER: "groq" })).toBe("gemini");
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

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format.json_schema).toMatchObject({ name: "interpret_result", strict: true });
    expect(JSON.stringify(body.response_format.json_schema.schema)).not.toMatch(/maxLength|\$schema/);
  });

  it("retries once when the reply doesn't validate", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply("{\"nope\": true}"))
      .mockResolvedValueOnce(groqReply(JSON.stringify(validReply)));
    await expect(generateStructured(request)).resolves.toEqual(validReply);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second bad reply", async () => {
    fetchMock.mockImplementation(async () => groqReply("not json"));
    await expect(generateStructured(request)).rejects.toBeInstanceOf(AiResponseError);
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
    await expect(generateStructured(request)).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
