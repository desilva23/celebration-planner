import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

const page = () => new NextRequest("http://localhost:3000/");

describe("proxy", () => {
  it("sends a nonce-based policy and hands the same nonce to Next.js", () => {
    const response = proxy(page());
    const policy = response.headers.get("content-security-policy")!;
    const nonce = response.headers.get("x-middleware-request-x-nonce")!;
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  });

  it("uses a fresh nonce for every request", () => {
    const nonce = () => proxy(page()).headers.get("x-middleware-request-x-nonce");
    expect(nonce()).not.toBe(nonce());
  });

  it("allows eval only on the development server", () => {
    expect(proxy(page()).headers.get("content-security-policy")).not.toContain("unsafe-eval");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(page()).headers.get("content-security-policy")).toContain("'unsafe-eval'");
  });

  it("runs on pages, not on API routes, static assets or prefetches", () => {
    const [matcher] = config.matcher;
    const runsOn = (path: string) => new RegExp(`^${matcher!.source}$`).test(path);
    expect(["/", "/some/page"].map(runsOn)).toEqual([true, true]);
    expect(["/api/ideas", "/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/icon.svg"].map(runsOn)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(matcher!.missing.map((m) => m.key)).toEqual(["next-router-prefetch", "purpose"]);
  });
});
