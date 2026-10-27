import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { discardSetAsidePlan, savePlan, setAsideSavedPlan } from "@/lib/client/plan-store";
import { shareLink } from "@/lib/client/share";
import { captureDownloads } from "@/test/downloads";
import { freezeToday, weddingPlan } from "@/test/plan";
import { PlannerApp } from "./PlannerApp";

let scrollTo: MockInstance<typeof window.scrollTo>;

beforeEach(() => {
  freezeToday();
  history.replaceState(null, "", "/");
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
    const user = userEvent.setup();
    savePlan(weddingPlan());
    setAsideSavedPlan();
    render(<PlannerApp aiProvider={null} />);

    await user.click(screen.getByRole("button", { name: "Remove the copy" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove the copy of your previous plan?" });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    await user.click(within(dialog).getByRole("button", { name: "Keep the copy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText(/previous plan was set aside/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove the copy" }));
    await user.click(screen.getByRole("button", { name: "Remove it" }));
    expect(screen.queryByText(/previous plan was set aside/)).not.toBeInTheDocument();
  });
});

describe("a shared plan link", () => {
  async function arriveWith(title: string) {
    const link = await shareLink(weddingPlan({ title }), window.location.origin);
    history.replaceState(null, "", link.slice(link.indexOf("/#")));
  }

  it("is offered, not opened unasked, and opens as the user's own copy", async () => {
    await arriveWith("Shared wedding");
    render(<PlannerApp aiProvider={null} />);
    const offer = (await screen.findByText(/A plan was shared with you: Shared wedding\./)).closest("p");
    expect(offer).toHaveTextContent("It opens as your own copy in this browser.");
    await userEvent.click(screen.getByRole("button", { name: "Open the shared plan" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Shared wedding" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("keeps the current plan as a copy rather than replacing it", async () => {
    savePlan(weddingPlan({ title: "My own plan" }));
    await arriveWith("Shared wedding");
    render(<PlannerApp aiProvider={null} />);
    expect(await screen.findByText(/keeps your current plan as a copy/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open the shared plan" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Shared wedding" })).toBeInTheDocument();
    expect(screen.getByText(/previous plan was set aside/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("celebration-planner:set-aside-plan")!).brief.title).toBe("My own plan");
  });

  it("can be turned down, leaving everything as it was", async () => {
    savePlan(weddingPlan({ title: "My own plan" }));
    await arriveWith("Shared wedding");
    render(<PlannerApp aiProvider={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/was shared with you/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "My own plan" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("is ignored when the link doesn't hold a readable plan", async () => {
    history.replaceState(null, "", "/#plan=not-a-plan");
    render(<PlannerApp aiProvider={null} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    expect(screen.queryByText(/was shared with you/)).not.toBeInTheDocument();
  });
});

describe("opening a plan file", () => {
  it("is offered on the start screen and opens the plan", async () => {
    render(<PlannerApp aiProvider={null} />);
    const file = new File([JSON.stringify(weddingPlan({ title: "From a file" }))], "plan.json");
    await userEvent.upload(screen.getByLabelText("Open a plan file you downloaded"), file);
    expect(await screen.findByRole("heading", { level: 1, name: "From a file" })).toBeInTheDocument();
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
    render(<PlannerApp aiProvider={null} />);

    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(screen.getByRole("alertdialog", { name: "Start a new plan?" })).toHaveAccessibleDescription(
      "This removes the current plan from this browser. Download it first if you want to keep a copy.",
    );
    await user.click(screen.getByRole("button", { name: "Keep this plan" }));
    expect(screen.getByRole("heading", { level: 1, name: "Anu & Ravi's wedding" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(screen.getByRole("button", { name: "Start a new plan" }));
    expect(await screen.findByRole("heading", { level: 1, name: /survives real life/ })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
