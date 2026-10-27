import { describe, expect, it, vi } from "vitest";
import { createStores } from "./stores";

const LIMITS = { limit: 2, windowMs: 60_000, ttlMs: 600_000, maxEntries: 10 };
const UPSTASH = { UPSTASH_REDIS_REST_URL: "https://eu1-example.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "secret" };

/** Answers Upstash pipeline requests from an in-memory map, and records them. */
function fakeUpstash() {
  const data = new Map<string, string>();
  const requests: { url: string; auth: string | null; commands: (string | number)[][] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const commands = JSON.parse(init.body as string) as (string | number)[][];
      requests.push({ url, auth: new Headers(init.headers).get("authorization"), commands });
      return Response.json(
        commands.map(([command, key, value]) => {
          const name = String(key);
          switch (command) {
            case "INCR": {
              const count = Number(data.get(name) ?? 0) + 1;
              data.set(name, String(count));
              return { result: count };
            }
            case "GET":
              return { result: data.get(name) ?? null };
            case "SET":
              data.set(name, String(value));
              return { result: "OK" };
            default:
              return { result: 1 };
          }
        }),
      );
    }),
  );
  return { requests };
}

describe("createStores", () => {
  it("keeps everything in memory unless both Upstash variables are set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const env of [{}, { UPSTASH_REDIS_REST_URL: UPSTASH.UPSTASH_REDIS_REST_URL }]) {
      const { limiter, cache } = createStores<string>(LIMITS, env);
      expect([(await limiter.check("a")).ok, (await limiter.check("a")).ok, (await limiter.check("a")).ok]).toEqual([
        true,
        true,
        false,
      ]);
      await cache.set("k", "v");
      expect(await cache.get("k")).toBe("v");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("with Upstash Redis", () => {
    it("counts each client's requests per window, never storing the raw address", async () => {
      const { requests } = fakeUpstash();
      const start = 1_800_000_000_000; // exactly on a window boundary
      let time = start + 15_000;
      const { limiter } = createStores(LIMITS, UPSTASH, () => time);
      const checks = [await limiter.check("203.0.113.9"), await limiter.check("203.0.113.9")];
      expect(checks.every((c) => c.ok)).toBe(true);
      expect(await limiter.check("203.0.113.9")).toEqual({ ok: false, retryAfterSeconds: 45 });
      expect((await limiter.check("198.51.100.1")).ok).toBe(true);

      const [first] = requests;
      expect(first!.url).toBe("https://eu1-example.upstash.io/pipeline");
      expect(first!.auth).toBe("Bearer secret");
      const [[incr, key], [expire, sameKey, ttl]] = first!.commands as [[string, string], [string, string, number]];
      expect([incr, expire, ttl]).toEqual(["INCR", "PEXPIRE", 60_000]);
      expect(sameKey).toBe(key);
      expect(key).toMatch(/^celebration-planner:rate:[0-9a-f]{32}:\d+$/);
      expect(JSON.stringify(requests)).not.toContain("203.0.113.9");

      time = start + 60_000;
      expect((await limiter.check("203.0.113.9")).ok).toBe(true);
    });

    it("also finds it under the names Vercel's Upstash integration sets", async () => {
      const { requests } = fakeUpstash();
      const env = { KV_REST_API_URL: "https://kv-example.upstash.io", KV_REST_API_TOKEN: "kv-secret" };
      const { cache } = createStores<string>(LIMITS, env);
      await cache.set("abc", "value");
      expect(requests.map(({ url, auth }) => [url, auth])).toEqual([
        ["https://kv-example.upstash.io/pipeline", "Bearer kv-secret"],
      ]);
    });

    it("shares cached answers for the configured time", async () => {
      const { requests } = fakeUpstash();
      const { cache } = createStores<{ source: string }>(LIMITS, UPSTASH);
      expect(await cache.get("abc")).toBeUndefined();
      await cache.set("abc", { source: "ai" });
      expect(await cache.get("abc")).toEqual({ source: "ai" });
      expect(requests[1]!.commands).toEqual([
        ["SET", "celebration-planner:cache:abc", '{"source":"ai"}', "PX", 600_000],
      ]);
    });

    it.each([
      ["is unreachable", () => Promise.reject(new TypeError("fetch failed")), "fetch failed"],
      ["returns an error status", async () => new Response("Unauthorized", { status: 401 }), "Upstash returned 401"],
      [
        "rejects a command",
        async () => Response.json([{ error: "ERR wrong number of arguments" }]),
        "Upstash command failed: ERR wrong number of arguments",
      ],
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is under test
      ["fails in an unexpected way", () => Promise.reject("boom"), "UnknownError"],
    ])("keeps serving requests when Upstash %s", async (_, reply, logged) => {
      vi.stubGlobal("fetch", vi.fn(reply));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { limiter, cache } = createStores<string>(LIMITS, UPSTASH);
      expect(await limiter.check("203.0.113.9")).toEqual({ ok: true });
      expect(await cache.get("abc")).toBeUndefined();
      await expect(cache.set("abc", "value")).resolves.toBeUndefined();
      expect(log.mock.calls.map(([message]) => message)).toEqual([
        `[store] rate limit check failed, request allowed: ${logged}`,
        `[store] cache read failed: ${logged}`,
        `[store] cache write failed: ${logged}`,
      ]);
    });
  });
});
