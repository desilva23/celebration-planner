import { describe, expect, it, vi } from "vitest";
import { clientKey, createRateLimiter, trustedProxyHops } from "./rate-limit";

describe("createRateLimiter", () => {
  it("blocks after the limit and recovers once the window passes", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("a", 10).ok).toBe(true);
    expect(limiter.check("a", 20)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.check("b", 20).ok).toBe(true);
    expect(limiter.check("a", 1001).ok).toBe(true);
  });

  it("says how long until the oldest request in the window expires", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
    limiter.check("a", 0);
    limiter.check("a", 4_000);
    expect(limiter.check("a", 5_500)).toEqual({ ok: false, retryAfterSeconds: 5 });
  });

  it("blocks everything for a full window when the limit is zero", () => {
    expect(createRateLimiter({ limit: 0, windowMs: 60_000 }).check("a", 0)).toEqual({
      ok: false,
      retryAfterSeconds: 60,
    });
  });

  it("keeps limiting correctly after forgetting idle clients", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    for (let i = 0; i <= 10_000; i++) limiter.check(`client-${i}`, 0);
    expect(limiter.check("client-0", 500).ok).toBe(false);
    // Over 10,000 clients, so this check also clears out the idle ones.
    expect(limiter.check("newcomer", 1_000).ok).toBe(true);
    expect(limiter.check("client-0", 1_000).ok).toBe(true);
    expect(limiter.check("newcomer", 1_500).ok).toBe(false);
  });

  it("uses the real clock by default", () => {
    expect(createRateLimiter({ limit: 1, windowMs: 60_000 }).check("a").ok).toBe(true);
  });
});

describe("clientKey", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  // What a client that forges the header looks like after Cloud Run appends the real address.
  const spoofed = request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8 , 203.0.113.9" });

  // Regression: the left-most entry was used, so a client could rotate a fake
  // X-Forwarded-For value on every request and never be rate limited.
  it("uses the address the nearest proxy appended, ignoring entries the client wrote", () => {
    expect(clientKey(spoofed, 1)).toBe("203.0.113.9");
  });

  it("steps further back behind a load balancer that appends its own address too", () => {
    expect(clientKey(request({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 34.120.0.1" }), 2)).toBe("203.0.113.9");
  });

  it("uses the left-most entry when there are fewer entries than hops", () => {
    expect(clientKey(request({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
  });

  it("falls back to the real-IP header, then to a shared bucket", () => {
    expect(clientKey(request({ "x-forwarded-for": " , ", "x-real-ip": "10.0.0.2" }), 1)).toBe("10.0.0.2");
    expect(clientKey(request({}), 1)).toBe("anonymous");
  });

  it("reads the number of hops from TRUSTED_PROXY_HOPS", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(clientKey(spoofed)).toBe("5.6.7.8");
  });
});

describe("trustedProxyHops", () => {
  it("defaults to one hop, and ignores values that aren't a whole number of at least one", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    for (const bad of ["0", "-1", "1.5", "two", ""]) expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: bad }), bad).toBe(1);
  });
});
