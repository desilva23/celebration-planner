import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { applyChange, setBudgetAmount } from "@/lib/domain/plan";
import { addPayment, bookVendor, upsertVendor } from "@/lib/domain/vendors";
import type { Plan } from "@/lib/domain/schema";
import { TODAY } from "@/lib/domain/fixtures.test-helpers";
import { axeViolations } from "@/test/axe";
import { panelProps, vendor, weddingPlan } from "@/test/plan";
import { BudgetPanel } from "./BudgetPanel";

function setup(plan: Plan = weddingPlan(), today = TODAY) {
  const props = panelProps(plan, today);
  const user = userEvent.setup();
  return { ...render(<BudgetPanel {...props} />), ...props, user };
}

const total = () => screen.getByText(/^Planned/).textContent;
const row = (category: string) => screen.getByRole("rowheader", { name: new RegExp(`^${category}`) }).closest("tr")!;
const amountField = (category: string) => screen.getByLabelText(`${category} amount in rupees`);
const overBudget = () => applyChange(weddingPlan(), { guestCount: 250 }, TODAY).plan;

describe("BudgetPanel", () => {
  it("shows a fully allocated plan line by line, labelling every figure an estimate", async () => {
    const { container } = setup();
    expect(total()).toBe("Planned ₹8,00,000 of ₹8,00,000 · fully allocated");
    expect(screen.getByLabelText("Share of the budget that is planned")).toHaveAttribute("value", "800000");
    expect(
      within(row("Catering"))
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["", "32%", "Estimate"]);
    expect(amountField("Catering")).toHaveValue(256_000);
    expect(within(row("Catering")).getByText("Scales with guests")).toBeInTheDocument();
    expect(within(row("Venue")).queryByText("Scales with guests")).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Total" }).nextElementSibling).toHaveTextContent("₹8,00,000");
    expect(screen.queryByText(/What would you rather give up/)).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("shows how much has already been paid to vendors", () => {
    let plan = bookVendor(upsertVendor(weddingPlan(), vendor({ quote: 150_000, status: "quoted" })), "v1").plan;
    plan = addPayment(plan, "v1", {
      id: "a",
      label: "Advance",
      amount: 50_000,
      dueDate: "2026-10-20",
      paid: true,
    }).plan;
    setup(plan);
    expect(total()).toMatch(/ · ₹50,000 paid$/);
  });

  it("shows money still unallocated and what's already confirmed", () => {
    const withVendor = upsertVendor(weddingPlan(), vendor({ quote: 150_000, status: "quoted" }));
    setup(bookVendor(withVendor, "v1").plan);
    expect(total()).toBe("Planned ₹7,74,000 of ₹8,00,000 · ₹26,000 unallocated · ₹1,50,000 confirmed");
    expect(
      within(row("Venue"))
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["₹1,50,000", "19%", "Confirmed"]);
    expect(screen.queryByLabelText("Venue amount in rupees")).not.toBeInTheDocument();
  });

  it("shows 0% shares rather than dividing by nothing when no money is planned", () => {
    const plan = weddingPlan();
    setup({ ...plan, budget: plan.budget.map((l) => ({ ...l, amount: 0 })) });
    expect(within(row("Venue")).getAllByRole("cell")[1]).toHaveTextContent("0%");
  });

  it("warns when catering looks thin for the experience level", () => {
    setup(setBudgetAmount(weddingPlan(), "catering", 100_000));
    expect(
      screen.getByText(/^Catering works out to ₹500 per guest\. A standard event usually needs around ₹800/),
    ).toBeInTheDocument();
  });

  describe("editing an amount", () => {
    it.each([["{Tab}"], ["{Enter}"]])("saves a new estimate on %s", async (key) => {
      const { user, onChange } = setup();
      await user.clear(amountField("Decor"));
      await user.type(amountField("Decor"), `90000${key}`);
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0]![0].budget.find((l) => l.category === "decor")!.amount).toBe(90_000);
    });

    // Regression: a figure too large to store used to be accepted, and the
    // whole plan was then discarded the next time the page loaded.
    it.each([["-5"], ["99999999999999999"], ["96000"]])(
      "puts back the old figure instead of saving %s",
      async (typed) => {
        const { user, onChange } = setup();
        await user.clear(amountField("Decor"));
        await user.type(amountField("Decor"), `${typed}{Tab}`);
        expect(onChange).not.toHaveBeenCalled();
        expect(amountField("Decor")).toHaveValue(96_000);
      },
    );
  });

  describe("when the plan is over budget", () => {
    it("offers each way back into budget, explaining the ones that can't close the gap", async () => {
      const { container } = setup(overBudget());
      expect(
        screen.getByRole("heading", { name: "You’re ₹70,000 over. What would you rather give up?" }),
      ).toBeInTheDocument();
      const options = screen.getAllByRole("heading", { level: 4 });
      expect(options.map((h) => h.textContent)).toEqual([
        "Absorb it in the contingency buffer",
        "Keep Catering, Photography as planned and trim the rest",
        "Invite fewer guests",
        "Keep the plan and raise the budget",
      ]);
      const contingency = options[0]!.closest("li")!;
      expect(within(contingency).getByRole("button", { name: "Choose this" })).toBeDisabled();
      expect(within(contingency).getByRole("button", { name: "Choose this" })).toHaveAccessibleDescription(
        "Doesn’t close the gap on its own.",
      );
      expect(await axeViolations(container)).toEqual([]);
    });

    it("applies a chosen option and reports its impacts", async () => {
      const { user, onUpdate } = setup(overBudget());
      const trim = screen.getByRole("heading", { name: "Invite fewer guests" }).closest("li")!;
      await user.click(within(trim).getByRole("button", { name: "Choose this" }));
      const [update, heading] = onUpdate.mock.calls[0]!;
      expect(heading).toBe("Applied: Invite fewer guests");
      expect(update.plan.brief.guestCount).toBeLessThan(250);
      expect(update.effects.every((e) => e.tone === "info")).toBe(true);
      expect(update.effects[0]!.message).toMatch(/^Invite \d+ instead of 250/);
    });

    it("lets the user change what's protected, up to four categories", async () => {
      const { user, onUpdate } = setup(overBudget());
      const box = (name: string) => screen.getByRole("checkbox", { name });
      expect(box("Catering")).toBeChecked();
      expect(screen.queryByRole("checkbox", { name: "Contingency" })).not.toBeInTheDocument();
      await user.click(box("Venue"));
      expect(onUpdate).toHaveBeenLastCalledWith(expect.anything(), "Priorities updated");
      expect(onUpdate.mock.lastCall![0].plan.brief.priorities).toEqual(["catering", "photography", "venue"]);
      await user.click(box("Catering"));
      expect(onUpdate.mock.lastCall![0].plan.brief.priorities).toEqual(["photography"]);
    });

    it("disables further priorities once four are protected", () => {
      const plan = overBudget();
      setup({ ...plan, brief: { ...plan.brief, priorities: ["catering", "photography", "venue", "decor"] } });
      expect(screen.getByRole("checkbox", { name: "Attire" })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: "Venue" })).toBeEnabled();
    });

    // Regression: on the event day the domain refuses the change, and the click
    // used to do nothing at all.
    it("says why priorities can't change once the event day arrives", async () => {
      const { user, onUpdate } = setup(overBudget(), "2027-03-01");
      await user.click(screen.getByRole("checkbox", { name: "Venue" }));
      expect(screen.getByRole("alert")).toHaveTextContent("The event date has to be after today.");
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("gives a general message, and clears it after a later success", async () => {
      const props = panelProps(overBudget());
      props.onUpdate.mockImplementationOnce(() => {
        throw new Error("storage exploded");
      });
      const user = userEvent.setup();
      render(<BudgetPanel {...props} />);
      await user.click(screen.getByRole("checkbox", { name: "Venue" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Priorities couldn't be updated.");
      await user.click(screen.getByRole("checkbox", { name: "Venue" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
