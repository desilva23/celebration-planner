import "server-only";
import { createHash } from "node:crypto";
import { createRateLimiter, type RateLimitResult } from "./rate-limit";
import { createTtlCache } from "./ttl-cache";

// Where rate-limit counts and cached AI answers live. In memory by default,
// which is per server instance. With Upstash Redis configured they are shared,
// so limits hold however many instances are running.

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

export interface ResponseCache<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V): Promise<void>;
}

export interface StoreLimits {
  /** Requests allowed per client per window. */
  limit: number;
  windowMs: number;
  /** How long an identical request is answered from the cache. */
  ttlMs: number;
  /** In-memory cache size; Redis expires entries by time alone. */
  maxEntries: number;
}

type Env = Record<string, string | undefined>;
type Command = (string | number)[];
type RunCommands = (commands: Command[]) => Promise<unknown[]>;

const PREFIX = "celebration-planner:";

/** Sends Redis commands to Upstash's REST API in one round trip. */
function upstash({ url, token }: { url: string; token: string }): RunCommands {
  return async (commands) => {
    const response = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`Upstash returned ${response.status}`);
    const replies = (await response.json()) as { result?: unknown; error?: string }[];
    const failed = replies.find((reply) => reply.error);
    if (failed) throw new Error(`Upstash command failed: ${failed.error}`);
    return replies.map((reply) => reply.result);
  };
}

/** Store failures are logged and then ignored, so Redis being down never takes the app down. */
function logStoreError(action: string, error: unknown): void {
  console.error(`[store] ${action}: ${error instanceof Error ? error.message : "UnknownError"}`);
}

/** Fixed-window counter per client. Addresses are hashed before they leave the server. */
function redisRateLimiter(run: RunCommands, { limit, windowMs }: StoreLimits, now = Date.now): RateLimiter {
  return {
    async check(key) {
      const time = now();
      const window = Math.floor(time / windowMs);
      const client = createHash("sha256").update(key).digest("hex").slice(0, 32);
      const redisKey = `${PREFIX}rate:${client}:${window}`;
      try {
        const [count] = await run([
          ["INCR", redisKey],
          ["PEXPIRE", redisKey, windowMs],
        ]);
        if (Number(count) <= limit) return { ok: true };
        return { ok: false, retryAfterSeconds: Math.ceil(((window + 1) * windowMs - time) / 1000) };
      } catch (error) {
        logStoreError("rate limit check failed, request allowed", error);
        return { ok: true };
      }
    },
  };
}

function redisCache<V>(run: RunCommands, { ttlMs }: StoreLimits): ResponseCache<V> {
  return {
    async get(key) {
      try {
        const [value] = await run([["GET", `${PREFIX}cache:${key}`]]);
        return typeof value === "string" ? (JSON.parse(value) as V) : undefined;
      } catch (error) {
        logStoreError("cache read failed", error);
        return undefined;
      }
    },
    async set(key, value) {
      try {
        await run([["SET", `${PREFIX}cache:${key}`, JSON.stringify(value), "PX", ttlMs]]);
      } catch (error) {
        logStoreError("cache write failed", error);
      }
    },
  };
}

function memoryRateLimiter(limits: StoreLimits): RateLimiter {
  const limiter = createRateLimiter(limits);
  return { check: async (key) => limiter.check(key) };
}

function memoryCache<V>(limits: StoreLimits): ResponseCache<V> {
  const cache = createTtlCache<V>(limits);
  return {
    get: async (key) => cache.get(key),
    set: async (key, value) => cache.set(key, value),
  };
}

/**
 * Upstash Redis when its URL and token are both set, memory otherwise. Vercel's
 * Upstash integration names them KV_REST_API_URL and KV_REST_API_TOKEN, so
 * those are read too, as Upstash's own client does.
 */
export function createStores<V>(limits: StoreLimits, env: Env = process.env, now?: () => number) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) {
    const run = upstash({ url, token });
    return { limiter: redisRateLimiter(run, limits, now), cache: redisCache<V>(run, limits) };
  }
  return { limiter: memoryRateLimiter(limits), cache: memoryCache<V>(limits) };
}
