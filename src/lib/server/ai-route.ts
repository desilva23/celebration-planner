import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { AiEnvelope } from "../ai/contracts";
import { AiProviderError, AiUnavailableError } from "../ai/errors";
import { clientKey } from "./rate-limit";
import { createStores } from "./stores";

const MAX_BODY_BYTES = 32_000;

const { limiter, cache } = createStores<AiEnvelope<unknown>>({
  limit: 20,
  windowMs: 60_000,
  ttlMs: 10 * 60_000,
  maxEntries: 200,
});

function fail(status: number, message: string, headers?: Record<string, string>, issues?: string[]): Response {
  return Response.json({ error: message, ...(issues ? { issues } : {}) }, { status, headers });
}

/**
 * Reads the body but gives up once it passes `limit` bytes, so a request that
 * doesn't declare its size can't make the server buffer an unbounded upload.
 */
async function readBody(request: Request, limit: number): Promise<string | null> {
  // No body reads as empty text, which then fails as JSON like any other non-JSON text.
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Rejects browser requests from other sites so they can't spend this server's AI quota. */
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface AiRouteOptions<I, O> {
  name: string;
  input: z.ZodType<I>;
  run: (input: I) => Promise<O>;
  /** Used when the model is unconfigured or fails. Without one, the route returns 503. */
  fallback?: (input: I) => O;
}

/** A response refusing the request before its body is read, or null to carry on. */
async function refusal(request: Request): Promise<Response | null> {
  if (!fromThisSite(request)) return fail(403, "Cross-site requests are not allowed.");
  const limit = await limiter.check(clientKey(request));
  if (limit.ok) return null;
  return fail(429, "Too many requests. Wait a moment and try again.", {
    "Retry-After": String(limit.retryAfterSeconds),
  });
}

/** The body as validated input, or a response saying what's wrong with it. */
async function readInput<I>(request: Request, schema: z.ZodType<I>): Promise<{ data: I } | { error: Response }> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return { error: fail(413, "Request is too large.") };
  }
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return { error: fail(413, "Request is too large.") };

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: fail(400, "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (parsed.success) return { data: parsed.data };
  const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
  return { error: fail(400, "Some fields are missing or invalid.", undefined, issues) };
}

/**
 * Logs why the model call failed. Provider errors carry the provider's own
 * message (status, quota, schema problems), never the user's text, so they
 * are safe to log in full; anything else is logged by name only.
 */
function logFailure(name: string, error: unknown): void {
  if (error instanceof AiUnavailableError) return;
  if (error instanceof AiProviderError) console.error(`[ai:${name}] ${error.message}`);
  else console.error(`[ai:${name}] ${error instanceof Error ? error.name : "UnknownError"}`);
}

/** The built-in answer when there is one, otherwise a 503 that says why. */
function fallbackResponse<I, O>(error: unknown, input: I, fallback?: (input: I) => O): Response {
  const unconfigured = error instanceof AiUnavailableError;
  if (!fallback) {
    return fail(
      503,
      unconfigured ? "AI isn't configured on this server." : "The AI service didn't respond. Try again in a moment.",
    );
  }
  const envelope: AiEnvelope<O> = {
    source: "fallback",
    data: fallback(input),
    notice: unconfigured
      ? "AI isn't configured on this server, so this is a built-in suggestion."
      : "The AI service didn't respond, so this is a built-in suggestion.",
  };
  return Response.json(envelope);
}

/**
 * Builds a POST handler for an AI feature: same-origin check, rate limit, size
 * cap, schema validation, response cache, then the model call with a
 * deterministic fallback. User content is never logged.
 */
export function aiRoute<I, O>({ name, input, run, fallback }: AiRouteOptions<I, O>) {
  return async function POST(request: Request): Promise<Response> {
    const refused = await refusal(request);
    if (refused) return refused;
    const read = await readInput(request, input);
    if ("error" in read) return read.error;

    const key = createHash("sha256").update(name).update(JSON.stringify(read.data)).digest("hex");
    const cached = await cache.get(key);
    if (cached) return Response.json(cached);

    try {
      const envelope: AiEnvelope<O> = { source: "ai", data: await run(read.data) };
      await cache.set(key, envelope);
      return Response.json(envelope);
    } catch (error) {
      logFailure(name, error);
      return fallbackResponse(error, read.data, fallback);
    }
  };
}
