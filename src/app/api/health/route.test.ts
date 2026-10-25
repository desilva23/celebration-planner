import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports liveness and which AI provider is active, without exposing keys", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "secret-key");
    vi.stubEnv("AI_PROVIDER", "");
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: true, ai: "groq" });
    expect(body).not.toContain("secret-key");
  });

  it("reports no provider when none is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(await GET().json()).toEqual({ ok: true, ai: null });
  });
});
