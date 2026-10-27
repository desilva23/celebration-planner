"use client";

import { useCallback, useState } from "react";
import type { AiEnvelope } from "../ai/contracts";

async function postJson<T>(path: string, body: unknown): Promise<AiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  // A reply that isn't JSON is handled like one with no body.
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : `Request failed (${response.status}).`);
  }
  return data as AiEnvelope<T>;
}

type CallState<T> =
  | { status: "idle" }
  | { status: "loading"; envelope?: AiEnvelope<T> }
  | { status: "done"; envelope: AiEnvelope<T> }
  | { status: "error"; error: string; envelope?: AiEnvelope<T> };

/** One AI request at a time, with loading and error state for the UI. */
export function useAiCall<T>(path: string) {
  const [state, setState] = useState<CallState<T>>({ status: "idle" });

  const run = useCallback(
    async (body: unknown): Promise<AiEnvelope<T> | null> => {
      setState((s) => ({ status: "loading", envelope: "envelope" in s ? s.envelope : undefined }));
      try {
        const envelope = await postJson<T>(path, body);
        setState({ status: "done", envelope });
        return envelope;
      } catch (error) {
        // Keep the last good result, so a failed follow-up doesn't wipe what the user had.
        setState((s) => ({
          status: "error",
          error: error instanceof Error ? error.message : "Something went wrong.",
          envelope: "envelope" in s ? s.envelope : undefined,
        }));
        return null;
      }
    },
    [path],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return {
    run,
    reset,
    loading: state.status === "loading",
    error: state.status === "error" ? state.error : null,
    envelope: "envelope" in state ? state.envelope : undefined,
  };
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}
