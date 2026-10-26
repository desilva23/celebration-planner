// Sliding-window limiter held in memory. It is per server instance, which is
// enough to stop a single client from burning the AI quota; a shared store
// (Redis, Firestore) would be needed for a hard global limit.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        // With a limit of zero there is no oldest request, so wait a full window.
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - oldest)) / 1000) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, times] of hits) if (now - Math.max(...times) >= windowMs) hits.delete(k);
      }
      return { ok: true };
    },
  };
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous"
  );
}
