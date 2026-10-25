import { connection } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { PlannerApp } from "@/components/PlannerApp";
import Home from "./page";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/components/PlannerApp", () => ({ PlannerApp: () => null }));

describe("Home", () => {
  it("renders per request and tells the app which provider is live", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    const page = await Home();
    expect(connection).toHaveBeenCalled();
    expect(page.type).toBe(PlannerApp);
    expect(page.props).toEqual({ aiProvider: "Gemini" });
  });

  it("tells the app when AI is off", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    expect((await Home()).props).toEqual({ aiProvider: null });
  });
});
