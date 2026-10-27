import { describe, expect, it } from "vitest";
import { AiProviderError, AiResponseError, AiUnavailableError } from "./errors";

describe("AI errors", () => {
  // The name is what gets logged, so it should say what went wrong.
  it("are named after their class", () => {
    expect(new AiUnavailableError("x").name).toBe("AiUnavailableError");
    expect(new AiResponseError("x").name).toBe("AiResponseError");
    expect(new AiProviderError("x", 500).name).toBe("AiProviderError");
  });
});
