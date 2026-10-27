import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

const directives = (policy: string) => new Map(policy.split("; ").map((d) => [d.split(" ")[0], d] as const));

describe("contentSecurityPolicy", () => {
  it("only runs scripts and styles carrying this request's nonce in production", () => {
    const policy = directives(contentSecurityPolicy("abc123", false));
    expect(policy.get("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy.get("style-src")).toBe("style-src 'self' 'nonce-abc123'");
    expect(policy.get("connect-src")).toBe("connect-src 'self'");
    expect(contentSecurityPolicy("abc123", false)).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("blocks plugins, framing and base-tag tricks", () => {
    const policy = directives(contentSecurityPolicy("n", false));
    expect(policy.get("object-src")).toBe("object-src 'none'");
    expect(policy.get("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(policy.get("base-uri")).toBe("base-uri 'self'");
    expect(policy.get("form-action")).toBe("form-action 'self'");
  });

  it("relaxes only what the development server needs", () => {
    const policy = directives(contentSecurityPolicy("n", true));
    expect(policy.get("script-src")).toBe("script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval'");
    expect(policy.get("style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(policy.get("connect-src")).toBe("connect-src 'self' ws:");
  });
});
