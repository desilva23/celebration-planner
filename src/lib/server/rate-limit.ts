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

/** TRUSTED_PROXY_HOPS as a whole number of at least 1; anything else means 1. */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const hops = Number(env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(hops) && hops >= 1 ? hops : 1;
}

/**
 * The client's address, for rate limiting. Each proxy appends the address it
 * received the request from to X-Forwarded-For, so only the right-most entries
 * were written by infrastructure you run; anything to their left came from the
 * client and can be forged. `hops` counts back from the right: 1 suits Cloud
 * Run's run.app URL, Vercel and a single reverse proxy; 2 suits an external
 * Google Cloud load balancer, which appends the client and then itself.
 */
export function clientKey(request: Request, hops: number = trustedProxyHops()): string {
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return chain[Math.max(0, chain.length - hops)] || request.headers.get("x-real-ip") || "anonymous";
}
