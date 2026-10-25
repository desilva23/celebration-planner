import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

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

  it("prefers the first forwarded address, then the real-IP header, then a shared bucket", () => {
    expect(clientKey(request({ "x-forwarded-for": " 198.51.100.7 , 10.0.0.1", "x-real-ip": "10.0.0.2" }))).toBe("198.51.100.7");
    expect(clientKey(request({ "x-forwarded-for": "", "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(clientKey(request({}))).toBe("anonymous");
  });
});
