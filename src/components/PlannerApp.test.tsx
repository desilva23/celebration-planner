import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { discardSetAsidePlan, savePlan, setAsideSavedPlan } from "@/lib/client/plan-store";
import { captureDownloads } from "@/test/downloads";
import { freezeToday, weddingPlan } from "@/test/plan";
import { PlannerApp } from "./PlannerApp";

let scrollTo: MockInstance<typeof window.scrollTo>;

beforeEach(() => {
  freezeToday();
  savePlan(null);
  discardSetAsidePlan();
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

describe("a plan that was set aside", () => {
  it("is offered for download alongside a fresh start", async () => {
    const plan = weddingPlan({ title: "Old plan" });
    savePlan(plan);
    setAsideSavedPlan();
    const files = captureDownloads();
    render(<PlannerApp aiProvider={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(/^Your previous plan was set aside\./);
    expect(screen.getByRole("heading", { level: 1, name: /survives real life/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download the copy" }));
    expect(files.map((f) => f.name)).toEqual(["previous-celebration-plan.json"]);
    expect(JSON.parse(await files[0]!.blob.text())).toEqual(plan);
  });

  it("is only removed after the user confirms", async () => {
    savePlan(weddingPlan());
    setAsideSavedPlan();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<PlannerApp aiProvider={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove the copy" }));
    expect(confirm).toHaveBeenCalledWith("Remove the copy of your previous plan? This can't be undone.");
    expect(screen.getByText(/previous plan was set aside/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove the copy" }));
    expect(screen.queryByText(/previous plan was set aside/)).not.toBeInTheDocument();
  });
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
