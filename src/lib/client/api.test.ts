import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stubFetch } from "@/test/fetch";
import { newId, useAiCall } from "./api";

const envelope = { source: "ai", data: { answer: 42 } } as const;

describe("useAiCall", () => {
  it("posts JSON to its endpoint, shows loading, then the result", async () => {
    const api = stubFetch();
    const release = api.pending();
    const { result } = renderHook(() => useAiCall<{ answer: number }>("/api/ideas"));
    expect(result.current).toMatchObject({ loading: false, error: null, envelope: undefined });

    let returned: unknown;
    act(() => {
      void result.current.run({ question: "?" }).then((value) => (returned = value));
    });
    expect(result.current.loading).toBe(true);
    release(envelope);
    await waitFor(() => expect(result.current.envelope).toEqual(envelope));
    expect(result.current.loading).toBe(false);
    expect(returned).toEqual(envelope);
    expect(api.sent()).toEqual([{ url: "/api/ideas", body: { question: "?" } }]);
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  });

  it("posts to the endpoint it has now, if that changes", async () => {
    const api = stubFetch();
    api.reply(envelope);
    const { result, rerender } = renderHook(({ path }) => useAiCall(path), { initialProps: { path: "/api/ideas" } });
    rerender({ path: "/api/run-sheet" });
    await act(async () => {
      await result.current.run({});
    });
    expect(api.sent()[0]!.url).toBe("/api/run-sheet");
  });

  it("shows the server's own error message", async () => {
    const api = stubFetch();
    api.reply({ error: "Too many requests. Wait a moment and try again." }, 429);
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({});
    });
    expect(returned).toBeNull();
    expect(result.current.error).toBe("Too many requests. Wait a moment and try again.");
  });

  it.each([
    ["has no JSON body", () => new Response("upstream down", { status: 502 }), "Request failed (502)."],
    [
      "has an error that isn't text",
      () => Response.json({ error: { code: 1 } }, { status: 500 }),
      "Request failed (500).",
    ],
  ])("falls back to the status when the error response %s", async (_, response, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    await act(async () => {
      await result.current.run({});
    });
    expect(result.current.error).toBe(message);
  });

  it("explains when the server can't be reached", async () => {
    stubFetch().offline();
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    await act(async () => {
      await result.current.run({});
    });
    expect(result.current.error).toBe("Couldn't reach the server. Check your connection and try again.");
  });

  it("copes with a failure that isn't an Error", async () => {
    const odd = {
      json: async () => ({}),
      get ok(): boolean {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a non-Error throwable is what's under test
        throw "not an Error";
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odd),
    );
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    await act(async () => {
      await result.current.run({});
    });
    expect(result.current.error).toBe("Something went wrong.");
  });

  // Regression: a failed follow-up used to wipe the result the user already had.
  it("keeps the last result while a follow-up loads, and after it fails", async () => {
    const api = stubFetch();
    api.reply(envelope);
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    await act(async () => {
      await result.current.run({});
    });
    api.reply({ error: "Server error" }, 500);
    let followUp: Promise<unknown> = Promise.resolve();
    act(() => {
      followUp = result.current.run({ refinement: "cheaper" });
    });
    expect(result.current).toMatchObject({ loading: true, envelope });
    await act(async () => {
      await followUp;
    });
    expect(result.current).toMatchObject({ loading: false, error: "Server error", envelope });
  });

  it("reports a failure that lands after a reset, without bringing back old results", async () => {
    let fail = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((_, reject) => (fail = () => reject(new TypeError("offline"))))),
    );
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    let request: Promise<unknown> = Promise.resolve();
    act(() => {
      request = result.current.run({});
    });
    act(() => result.current.reset());
    await act(async () => {
      fail();
      await request;
    });
    expect(result.current).toMatchObject({
      error: "Couldn't reach the server. Check your connection and try again.",
      envelope: undefined,
    });
  });

  it("can be reset to its idle state", async () => {
    stubFetch().reply(envelope);
    const { result } = renderHook(() => useAiCall("/api/ideas"));
    await act(async () => {
      await result.current.run({});
    });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ loading: false, error: null, envelope: undefined });
  });
});

describe("newId", () => {
  it("makes short random ids", () => {
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("still works where crypto.randomUUID isn't available", () => {
    vi.stubGlobal("crypto", {});
    expect(newId()).toMatch(/^[0-9a-z]{1,8}$/);
  });

  it("still works where there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newId()).toMatch(/^[0-9a-z]{1,8}$/);
  });
});
