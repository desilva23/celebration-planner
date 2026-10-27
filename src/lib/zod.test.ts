import { describe, expect, it } from "vitest";
import { z } from "./zod";

describe("zod", () => {
  // The Content-Security-Policy forbids eval; see src/lib/zod.ts.
  it("is configured not to compile parsers with eval", () => {
    expect(z.config().jitless).toBe(true);
  });
});
