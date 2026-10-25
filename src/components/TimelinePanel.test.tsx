import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/dates";
import { TODAY } from "@/lib/domain/fixtures.test-helpers";
import { setTaskStatus } from "@/lib/domain/plan";
import type { Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { panelProps, weddingPlan } from "@/test/plan";
import { TimelinePanel } from "./TimelinePanel";

const BUDGET = "Agree the total budget and what matters most";
const VENUE = "Shortlist and book the venue";

function setup(plan: Plan = weddingPlan(), today = TODAY) {
  const props = panelProps(plan, today);
  const user = userEvent.setup();
  return { ...render(<TimelinePanel {...props} />), ...props, user };
}

const task = (title: string) => screen.getByLabelText(title).closest("li")!;
const badges = (title: string) => [...task(title).querySelectorAll(".badge")].map((b) => b.textContent);

describe("TimelinePanel", () => {
  it("lists tasks in due order, marking what's ready and what's waiting", async () => {
    const { container } = setup();
    const titles = [...container.querySelectorAll(".task-main label")].map((label) => label.textContent);
    expect(titles.slice(0, 3)).toEqual([BUDGET, "Draft the guest list", VENUE]);
    expect(titles.at(-1)).toBe("Write the day-of run sheet");
    expect(badges(BUDGET)).toEqual(["Ready", "High priority"]);
    expect(badges("Arrange outfits")).toEqual(["Ready"]);
    expect(within(task(BUDGET)).getByText("Due 7 Nov 2026")).toBeInTheDocument();
    expect(within(task("Draft the guest list")).getByText(`Waiting on: ${BUDGET}`)).toBeInTheDocument();
    expect(screen.queryByText(/schedule is compressed/)).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("warns when there's less time than this kind of event needs", () => {
    setup(weddingPlan({ eventDate: addDays(TODAY, 20) }));
    expect(screen.getByText(/^20 days left, against an ideal 120 for this kind of event/)).toBeInTheDocument();
  });

  it.each([
    ["2026-11-01", "Due this week"],
    ["2026-11-10", "Overdue"],
  ])("flags tasks by urgency on %s", (today, label) => {
    setup(weddingPlan(), today);
    expect(badges(BUDGET)[0]).toBe(label);
  });

  it("ticks a task off", async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByLabelText(BUDGET));
    expect(onChange.mock.lastCall![0].tasks.find((t) => t.id === "budget")!.status).toBe("done");
  });

  it("puts a finished task back on the list", async () => {
    const { user, onChange } = setup(setTaskStatus(weddingPlan(), "budget", "done"));
    expect(screen.getByLabelText(BUDGET)).toBeChecked();
    await user.click(screen.getByLabelText(BUDGET));
    expect(onChange.mock.lastCall![0].tasks.find((t) => t.id === "budget")!.status).toBe("todo");
  });

  it("marks finished tasks done and stops offering to reschedule them", () => {
    setup(setTaskStatus(weddingPlan(), "budget", "done"));
    expect(badges(BUDGET)).toEqual(["Done", "High priority"]);
    expect(within(task(BUDGET)).queryByText("Reschedule")).not.toBeInTheDocument();
    expect(badges("Draft the guest list")).toContain("Ready");
  });

  it("moves a task and everything that depends on it", async () => {
    const { user, onUpdate } = setup();
    const row = within(task(VENUE));
    await user.click(row.getByText("Reschedule"));
    const date = row.getByLabelText("New due date");
    expect(date).toHaveAttribute("min", TODAY);
    expect(date).toHaveAttribute("max", "2027-03-01");
    await user.clear(date);
    await user.type(date, "2027-01-20");
    await user.click(row.getByRole("button", { name: "Move it and update what depends on it" }));
    const [update, heading] = onUpdate.mock.calls[0];
    expect(heading).toBe("Schedule updated");
    expect(update.plan.tasks.find((t) => t.id === "venue")!.dueDate).toBe("2027-01-20");
    expect(update.effects[0].message).toMatch(/dependent tasks had to move/);
  });

  it("does nothing when the date is unchanged or cleared", async () => {
    const { user, onUpdate } = setup();
    const row = within(task(VENUE));
    await user.click(row.getByText("Reschedule"));
    await user.click(row.getByRole("button", { name: "Move it and update what depends on it" }));
    await user.clear(row.getByLabelText("New due date"));
    await user.click(row.getByRole("button", { name: "Move it and update what depends on it" }));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
