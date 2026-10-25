import { vi } from "vitest";

/** Replaces `fetch` with a queue of canned API replies and records what was sent. */
export function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return {
    reply(body: unknown, status = 200) {
      fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
    },
    /** A reply the test releases itself, to look at the loading state first. */
    pending(): (body: unknown) => void {
      let release: (body: unknown) => void = () => {};
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          release = (body) => resolve(Response.json(body));
        }),
      );
      return (body) => release(body);
    },
    offline() {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    },
    sent(): { url: string; body: unknown }[] {
      // The app always calls fetch with a path and a JSON string body.
      return fetchMock.mock.calls.map(([url, init]) => ({ url: url as string, body: JSON.parse(init?.body as string) }));
    },
  };
}
