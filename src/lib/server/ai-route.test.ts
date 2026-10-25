import { beforeEach, describe, expect, it } from "vitest";
import { POST as compareQuotes } from "@/app/api/compare-quotes/route";
import { POST as interpret } from "@/app/api/interpret/route";
import { TODAY, weddingBrief } from "../domain/fixtures.test-helpers";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

describe("AI routes", () => {
  it("falls back to the built-in interpreter when AI isn't configured", async () => {
    const res = await interpret(post({ message: "50 more guests", brief: weddingBrief(), today: TODAY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(body.notice).toMatch(/built-in/);
    expect(body.data.updates.guestCount).toBe(250);
  });

  it("rejects invalid input with readable issues", async () => {
    const res = await interpret(post({ message: "", brief: null, today: "tomorrow" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    expect((await interpret(post("{not json"))).status).toBe(400);
    expect((await interpret(post({ message: "x".repeat(40_000) }))).status).toBe(413);
  });

  it("refuses cross-site browser requests", async () => {
    const res = await interpret(post({ message: "hi", brief: null, today: TODAY }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("returns 503 rather than guessing when quote reading needs AI", async () => {
    const res = await compareQuotes(
      post({
        category: "catering", guestCount: 200, budgetForCategory: 250_000,
        quotes: [{ label: "A", text: "Veg menu at Rs 1,250 per plate for up to 200 guests." }],
      }),
    );
    expect(res.status).toBe(503);
  });
});
