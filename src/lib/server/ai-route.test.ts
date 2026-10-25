import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST as compareQuotes } from "@/app/api/compare-quotes/route";
import { POST as ideas } from "@/app/api/ideas/route";
import { POST as interpret } from "@/app/api/interpret/route";
import { POST as vendorBrief } from "@/app/api/vendor-brief/route";
import { AiProviderError, AiUnavailableError } from "../ai/errors";
import { allocateBudget } from "../domain/budget";
import { TODAY, weddingBrief } from "../domain/fixtures.test-helpers";
import { aiRoute } from "./ai-route";

// The rate limiter and cache are shared by every route in the process, so each
// test gets its own client address and route name.
let clients = 0;
const client = () => ({ "x-forwarded-for": `203.0.113.${++clients}` });

let routes = 0;
function route(
  run: (input: { message: string }) => Promise<string>,
  fallback?: (input: { message: string }) => string,
) {
  return aiRoute({ name: `test-${++routes}`, input: z.object({ message: z.string().min(1) }), run, fallback });
}

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
        category: "catering",
        guestCount: 200,
        budgetForCategory: 250_000,
        quotes: [{ label: "A", text: "Veg menu at Rs 1,250 per plate for up to 200 guests." }],
      }),
    );
    expect(res.status).toBe(503);
  });

  it("falls back to built-in ideas and vendor questions", async () => {
    const brief = weddingBrief();
    const ideasRes = await ideas(post({ brief, budget: allocateBudget(brief) }, client()));
    expect(await ideasRes.json()).toMatchObject({ source: "fallback", data: { ideas: expect.any(Array) } });
    const briefRes = await vendorBrief(post({ category: "venue", brief, budgetForCategory: 176_000 }, client()));
    expect(await briefRes.json()).toMatchObject({ source: "fallback", data: { questions: expect.any(Array) } });
  });

  it("lists at most five validation problems, naming the field", async () => {
    const res = await interpret(post({ message: "hi", brief: {}, today: TODAY }, client()));
    const body = await res.json();
    expect(body.issues).toHaveLength(5);
    expect(body.issues[0]).toMatch(/^brief\.\w+: /);
  });

  it("names the whole body when it isn't an object at all", async () => {
    const res = await interpret(post('"just text"', client()));
    expect((await res.json()).issues[0]).toMatch(/^body: /);
  });
});

describe("aiRoute", () => {
  it("labels the model's answer as AI and serves identical requests from cache", async () => {
    const run = vi.fn(async ({ message }: { message: string }) => `echo ${message}`);
    const handler = route(run);
    const headers = client();
    expect(await (await handler(post({ message: "hi" }, headers))).json()).toEqual({ source: "ai", data: "echo hi" });
    expect(await (await handler(post({ message: "hi" }, headers))).json()).toEqual({ source: "ai", data: "echo hi" });
    expect(run).toHaveBeenCalledTimes(1);
    await handler(post({ message: "something else" }, headers));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("falls back when the provider fails, logging the provider's message but never the user's text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = route(
      () => Promise.reject(new AiProviderError("Groq returned 401: Invalid API Key", 401)),
      ({ message }) => `built-in for ${message}`,
    );
    const res = await handler(post({ message: "my private plans" }, client()));
    expect(await res.json()).toEqual({
      source: "fallback",
      data: "built-in for my private plans",
      notice: "The AI service didn't respond, so this is a built-in suggestion.",
    });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[ai:test-\d+\] Groq returned 401: Invalid API Key$/));
    expect(JSON.stringify(log.mock.calls)).not.toContain("my private plans");
  });

  it.each([
    ["an error", new Error("echoing my private plans"), "Error"],
    ["something that isn't an Error", "my private plans", "UnknownError"],
  ])("logs only the type when the failure is %s", async (_, failure, logged) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejections are under test
    const fail = () => Promise.reject(failure);
    await route(fail, () => "built-in")(post({ message: "my private plans" }, client()));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[ai:test-\\d+\\] ${logged}$`)));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it("explains, without logging, when AI simply isn't configured", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await route(
      () => Promise.reject(new AiUnavailableError("no key")),
      () => "built-in",
    )(post({ message: "hi" }, client()));
    expect((await res.json()).notice).toBe("AI isn't configured on this server, so this is a built-in suggestion.");
    expect(log).not.toHaveBeenCalled();
  });

  it("doesn't cache a fallback, so the AI is tried again next time", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AiUnavailableError("no key"))
      .mockResolvedValueOnce("ai");
    const handler = route(run, () => "built-in");
    const headers = client();
    expect((await (await handler(post({ message: "hi" }, headers))).json()).source).toBe("fallback");
    expect((await (await handler(post({ message: "hi" }, headers))).json()).source).toBe("ai");
  });

  it.each([
    ["isn't configured", new AiUnavailableError("no key"), "AI isn't configured on this server."],
    ["fails", new AiProviderError("down", 500), "The AI service didn't respond. Try again in a moment."],
  ])("returns 503 when AI %s and there is no fallback", async (_, failure, error) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await route(() => Promise.reject(failure))(post({ message: "hi" }, client()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error });
  });

  it("limits each client to 20 requests a minute and says when to retry", async () => {
    const handler = route(async ({ message }) => message);
    const headers = client();
    for (let i = 0; i < 20; i++) expect((await handler(post({ message: `m${i}` }, headers))).status).toBe(200);
    const limited = await handler(post({ message: "one more" }, headers));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await handler(post({ message: "another client" }, client()))).status).toBe(200);
  });

  it("refuses a body whose declared size is too large before reading it", async () => {
    const res = await route(async () => "ok")(post({ message: "hi" }, { ...client(), "content-length": "40000" }));
    expect(res.status).toBe(413);
  });

  it("accepts a same-site request that arrives through a proxy", async () => {
    const headers = {
      ...client(),
      origin: "https://planner.example",
      "x-forwarded-host": "planner.example",
      host: "10.0.0.5:8080",
    };
    expect((await route(async () => "ok")(post({ message: "hi" }, headers))).status).toBe(200);
  });

  it("refuses an Origin it can't parse", async () => {
    expect((await route(async () => "ok")(post({ message: "hi" }, { ...client(), origin: "null" }))).status).toBe(403);
  });
});
