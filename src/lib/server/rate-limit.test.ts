import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { createTtlCache } from "./ttl-cache";

describe("createRateLimiter", () => {
  it("blocks after the limit and recovers once the window passes", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("a", 10).ok).toBe(true);
    expect(limiter.check("a", 20)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.check("b", 20).ok).toBe(true);
    expect(limiter.check("a", 1001).ok).toBe(true);
  });
});

describe("createTtlCache", () => {
  it("expires entries and evicts the oldest when full", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 100 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("c", 3, 0);
    expect(cache.get("a", 1)).toBeUndefined();
    expect(cache.get("c", 1)).toBe(3);
    expect(cache.get("c", 100)).toBeUndefined();
  });
});
