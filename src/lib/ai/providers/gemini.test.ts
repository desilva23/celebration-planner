import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Completion } from "../llm";
import { geminiComplete } from "./gemini";

const { GoogleGenAI, generateContent } = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    generateContent,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent } };
    }),
  };
});
vi.mock("@google/genai", () => ({ GoogleGenAI }));

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

describe("geminiComplete", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubEnv("GEMINI_LITE_MODEL", "");
    generateContent.mockReset();
  });

  it("asks for JSON against the given schema and returns the text", async () => {
    generateContent.mockResolvedValueOnce({ text: '{"ok":true}' });
    const request = completion();
    await expect(geminiComplete(request)).resolves.toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-3.5-flash-lite",
      contents: "user prompt",
      config: {
        systemInstruction: "system rules",
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object" },
        abortSignal: request.signal,
      },
    });
  });

  it("uses the larger model for smart requests, and honours overrides for both tiers", async () => {
    generateContent.mockResolvedValue({ text: "{}" });
    await geminiComplete(completion({ tier: "smart" }));
    vi.stubEnv("GEMINI_MODEL", "gemini-custom");
    vi.stubEnv("GEMINI_LITE_MODEL", "gemini-custom-lite");
    await geminiComplete(completion({ tier: "smart" }));
    await geminiComplete(completion({ tier: "lite" }));
    expect(generateContent.mock.calls.map(([args]) => (args as { model: string }).model)).toEqual([
      "gemini-3.8-flash",
      "gemini-custom",
      "gemini-custom-lite",
    ]);
  });

  it("returns an empty string when the reply has no text, for the caller to reject", async () => {
    generateContent.mockResolvedValueOnce({ text: undefined });
    await expect(geminiComplete(completion())).resolves.toBe("");
  });

  it("creates one client, with the server-side key", async () => {
    vi.resetModules();
    const { geminiComplete: fresh } = await import("./gemini");
    generateContent.mockResolvedValue({ text: "{}" });
    await fresh(completion());
    await fresh(completion());
    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-key" });
  });
});
