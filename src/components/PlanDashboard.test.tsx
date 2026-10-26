import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBudgetAmount } from "@/lib/domain/plan";
import type { Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { freezeToday, weddingPlan } from "@/test/plan";
import { PlanDashboard } from "./PlanDashboard";

/** Holds the plan in state, as the real app does, so changes re-render. */
function Harness({ initial, saved = () => {} }: { initial: Plan; saved?: (plan: Plan) => void }) {
  const [plan, setPlan] = useState(initial);
  return (
    <PlanDashboard
      plan={plan}
      onChange={(next) => {
        setPlan(next);
        saved(next);
      }}
    />
  );
}

const stat = (name: string) => screen.getByText(name, { selector: "dt" }).nextElementSibling;

async function reviseGuests(user: ReturnType<typeof userEvent.setup>, guests: string) {
  await user.click(screen.getByText("Or edit the details directly"));
  await user.clear(screen.getByLabelText("Guests"));
  await user.type(screen.getByLabelText("Guests"), guests);
  await user.click(screen.getByRole("button", { name: "Update the plan" }));
}

beforeEach(() => {
  freezeToday();
});

describe("PlanDashboard", () => {
  it("summarises the event, spend and progress, with links to each section", async () => {
    const { container } = render(<Harness initial={weddingPlan({ title: "Anu & Ravi's wedding" })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Anu & Ravi's wedding" })).toBeInTheDocument();
    expect(screen.getByText("Wedding · 1 Mar 2027 · 200 guests · Chennai")).toBeInTheDocument();
    expect(stat("Days to go")).toHaveTextContent("127");
    expect(stat("Planned spend")).toHaveTextContent("₹8,00,000 of ₹8,00,000");
    expect(stat("Tasks done")).toHaveTextContent("0 of 14");
    expect(screen.getByText(/Next up:/).closest("p")).toHaveTextContent(
      "Next up: Agree the total budget and what matters most, due 7 Nov 2026. See the timeline",
    );
    const nav = screen.getByRole("navigation", { name: "Plan sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["#change", "#budget", "#timeline", "#vendors", "#ideas"]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("leaves the city out when there isn't one", () => {
    render(<Harness initial={weddingPlan({ city: "" })} />);
    expect(screen.getByText("Wedding · 1 Mar 2027 · 200 guests")).toBeInTheDocument();
  });

  it("points to the trade-offs when the plan is over budget", () => {
    const plan = weddingPlan();
    render(<Harness initial={setBudgetAmount(plan, "venue", 300_000)} />);
    expect(screen.getByText(/The plan is ₹1,24,000 over budget\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a trade-off" })).toHaveAttribute("href", "#budget");
  });

  it.each([
    ["2026-10-25", "Today"],
    ["2026-10-20", "Passed"],
  ])("says the event is %s rather than counting negative days", (eventDate, label) => {
    const plan = weddingPlan();
    render(<Harness initial={{ ...plan, brief: { ...plan.brief, eventDate } }} />);
    expect(stat("Days to go")).toHaveTextContent(label);
  });

  it("drops the next-up hint once nothing is ready to start", () => {
    const plan = weddingPlan();
    render(<Harness initial={{ ...plan, tasks: plan.tasks.map((t) => ({ ...t, status: "done" as const })) }} />);
    expect(screen.queryByText(/Next up:/)).not.toBeInTheDocument();
    expect(stat("Tasks done")).toHaveTextContent("14 of 14");
  });

  it("undoes a change, putting back exactly the plan that was there before", async () => {
    const user = userEvent.setup();
    const initial = weddingPlan();
    const saved = vi.fn<(plan: Plan) => void>();
    render(<Harness initial={initial} saved={saved} />);
    await reviseGuests(user, "250");

    const toast = screen.getByRole("status");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(saved.mock.lastCall![0]).toBe(initial);
    expect(screen.getByText("Wedding · 1 Mar 2027 · 200 guests · Chennai")).toBeInTheDocument();
    expect(within(toast).getByRole("heading", { name: "Undone: Plan revised" })).toBeInTheDocument();
    expect(within(toast).getByText("Your plan is back to how it was.")).toBeInTheDocument();
    expect(within(toast).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("stops offering undo once the plan has changed in another way", async () => {
    const user = userEvent.setup();
    render(<Harness initial={weddingPlan()} />);
    await reviseGuests(user, "250");
    expect(within(screen.getByRole("status")).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Agree the total budget and what matters most"));
    expect(within(screen.getByRole("status")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("reports what a change moved, until dismissed", async () => {
    const user = userEvent.setup();
    render(<Harness initial={weddingPlan()} />);
    await reviseGuests(user, "250");

    const toast = screen.getByRole("status");
    expect(within(toast).getByRole("heading", { name: "Plan revised" })).toBeInTheDocument();
    expect(within(toast).getByText("Guests: 200 → 250")).toBeInTheDocument();
    expect(screen.getByText("250 guests", { exact: false })).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: "Dismiss" }));
    expect(toast).toBeEmptyDOMElement();
  });
});
