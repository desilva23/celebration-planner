import { describe, expect, it } from "vitest";
import { createTtlCache } from "./ttl-cache";

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

  it("misses on a key it never stored", () => {
    expect(createTtlCache<number>({ maxEntries: 1, ttlMs: 100 }).get("nope", 0)).toBeUndefined();
  });

  it("treats a re-stored key as the newest, so it isn't the next to go", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 100 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 3, 0);
    cache.set("c", 4, 0);
    expect([cache.get("a", 1), cache.get("b", 1), cache.get("c", 1)]).toEqual([3, undefined, 4]);
  });

  it("moves a re-stored key to the back of the queue even with room to spare", () => {
    const cache = createTtlCache<number>({ maxEntries: 3, ttlMs: 100 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 3, 0);
    cache.set("c", 4, 0);
    cache.set("d", 5, 0);
    expect([cache.get("a", 1), cache.get("b", 1)]).toEqual([3, undefined]);
  });

  it("uses the real clock by default", () => {
    const cache = createTtlCache<string>({ maxEntries: 1, ttlMs: 60_000 });
    cache.set("a", "kept");
    expect(cache.get("a")).toBe("kept");
  });
});
