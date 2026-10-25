import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { savePlan } from "@/lib/client/plan-store";
import { freezeToday, weddingPlan } from "@/test/plan";
import { PlannerApp } from "./PlannerApp";

let scrollTo: MockInstance<typeof window.scrollTo>;

beforeEach(() => {
  freezeToday();
  savePlan(null);
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

describe("PlannerApp", () => {
  it("shows a loading message while rendering on the server", () => {
    expect(renderToString(<PlannerApp aiProvider={null} />)).toContain("Loading your plan…");
  });

  it("starts with the intake form and says when AI is off", () => {
    render(<PlannerApp aiProvider={null} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Plan a celebration that survives real life" }),
    ).toBeInTheDocument();
    expect(screen.getByText("AI off, using built-in suggestions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New plan" })).not.toBeInTheDocument();
  });

  it("names the live AI provider", () => {
    render(<PlannerApp aiProvider="Gemini" />);
    expect(screen.getByText("AI assistant on (Gemini)")).toBeInTheDocument();
  });

  it("opens a new plan at the top of the page with focus on the main content", async () => {
    const user = userEvent.setup();
    render(<PlannerApp aiProvider={null} />);
    await user.type(screen.getByLabelText("Event date"), "2027-03-01");
    await user.type(screen.getByLabelText("Expected guests"), "200");
    await user.type(screen.getByLabelText("Total budget (₹)"), "800000");
    await user.click(screen.getByRole("button", { name: "Build my plan" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Wedding plan" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("only starts over once the user confirms", async () => {
    const user = userEvent.setup();
    savePlan(weddingPlan({ title: "Anu & Ravi's wedding" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<PlannerApp aiProvider={null} />);

    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(confirm).toHaveBeenCalledWith("Start a new plan? This removes the current plan from this browser.");
    expect(screen.getByRole("heading", { level: 1, name: "Anu & Ravi's wedding" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(await screen.findByRole("heading", { level: 1, name: /survives real life/ })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
