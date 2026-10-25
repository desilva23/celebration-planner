import { describe, expect, it, vi } from "vitest";
import { activeProvider } from "./provider-config";

describe("activeProvider", () => {
  it("uses whichever key is set, and AI_PROVIDER when both are", () => {
    expect(activeProvider({})).toBeNull();
    expect(activeProvider({ GROQ_API_KEY: "k" })).toBe("groq");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k" })).toBe("gemini");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AI_PROVIDER: "groq" })).toBe("groq");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AI_PROVIDER: "gemini" })).toBe("gemini");
    expect(activeProvider({ GEMINI_API_KEY: "k", AI_PROVIDER: "groq" })).toBe("gemini");
  });

  it("falls back to the other provider when the preferred one has no key", () => {
    expect(activeProvider({ GROQ_API_KEY: "k", AI_PROVIDER: "gemini" })).toBe("groq");
  });

  it("reads AI_PROVIDER loosely and ignores values it doesn't know", () => {
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AI_PROVIDER: "  GROQ " })).toBe("groq");
    expect(activeProvider({ GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AI_PROVIDER: "openai" })).toBe("gemini");
  });

  it("treats an empty key as unset", () => {
    expect(activeProvider({ GEMINI_API_KEY: "", GROQ_API_KEY: "" })).toBeNull();
  });

  it("reads the server's environment by default", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_PROVIDER", "");
    expect(activeProvider()).toBe("groq");
  });
});
