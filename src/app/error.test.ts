import { describe, expect, it } from "vitest";
import { ErrorScreen } from "@/components/ErrorScreen";
import ErrorPage from "./error";

describe("app error boundary", () => {
  it("shows the error screen", () => {
    expect(ErrorPage).toBe(ErrorScreen);
  });
});
