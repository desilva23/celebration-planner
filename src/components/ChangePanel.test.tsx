import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { InterpretResult } from "@/lib/ai/contracts";
import { PlanError } from "@/lib/domain/plan";
import { axeViolations } from "@/test/axe";
import { stubFetch } from "@/test/fetch";
import { panelProps, weddingPlan } from "@/test/plan";
import { ChangePanel } from "./ChangePanel";

const NO_UPDATES: InterpretResult["updates"] = {
  eventType: null, title: null, eventDate: null, guestCount: null, totalBudget: null,
  tier: null, city: null, priorities: null, notes: null,
};

function interpretation(updates: Partial<InterpretResult["updates"]>, clarifyingQuestion: string | null = null) {
  return {
    source: "fallback",
    notice: "AI isn't configured on this server, so this is a built-in suggestion.",
    data: { updates: { ...NO_UPDATES, ...updates }, understood: "Understood.", clarifyingQuestion },
  };
}

function setup(props = panelProps(weddingPlan())) {
  const user = userEvent.setup();
  const view = render(<ChangePanel {...props} />);
  async function preview(message = "50 more guests") {
    await user.type(screen.getByLabelText("What changed"), message);
    await user.click(screen.getByRole("button", { name: "Preview the changes" }));
  }
  return { ...view, ...props, user, preview };
}

describe("ChangePanel", () => {
  it("previews a plain-language change, then applies it to the plan", async () => {
    const api = stubFetch();
    api.reply(interpretation({ guestCount: 250, totalBudget: 720_000, eventDate: "2027-02-15" }));
    const { container, user, preview, onUpdate, plan } = setup();
    await preview("50 more guests, budget dropped by 80k, two weeks earlier");

    const rows = within(await screen.findByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["Guests: 200 → 250", "Budget: ₹8,00,000 → ₹7,20,000", "Date: 1 Mar 2027 → 15 Feb 2027"]);
    expect(screen.getByText("Built-in suggestion")).toBeInTheDocument();
    expect(api.sent()[0].body).toEqual({
      message: "50 more guests, budget dropped by 80k, two weeks earlier",
      brief: plan.brief,
      today: "2026-10-25",
    });
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));
    expect(onUpdate).toHaveBeenCalledOnce();
    const [update, heading] = onUpdate.mock.calls[0];
    expect(heading).toBe("Plan revised");
    expect(update.plan.brief).toMatchObject({ guestCount: 250, totalBudget: 720_000, eventDate: "2027-02-15" });
    expect(screen.getByLabelText("What changed")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Apply to my plan" })).not.toBeInTheDocument();
  });

  it.each([
    [{ tier: "premium", priorities: ["venue", "decor"] }, ["Experience: standard → premium", "Matters most: Venue, Decor"]],
    [{ priorities: [] }, ["Matters most: nothing protected"]],
  ] as const)("describes changes to the experience and priorities: %o", async (updates, rows) => {
    stubFetch().reply(interpretation({ ...updates, priorities: [...updates.priorities] }));
    const { preview } = setup();
    await preview();
    expect(within(await screen.findByRole("list")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(rows);
  });

  it("says when nothing would change, and passes on the clarifying question", async () => {
    stubFetch().reply(interpretation({ guestCount: 200, priorities: ["catering", "photography"] }, "By how much did the budget change?"));
    const { preview } = setup();
    await preview("our budget dropped a bit");
    expect(await screen.findByText("Nothing to change in the plan yet.")).toBeInTheDocument();
    expect(screen.getByText("By how much did the budget change?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply to my plan" })).not.toBeInTheDocument();
  });

  it("discards a proposal without touching the plan", async () => {
    stubFetch().reply(interpretation({ guestCount: 250 }));
    const { user, preview, onUpdate } = setup();
    await preview();
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Guests: 200 → 250")).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("explains why a proposed change can't be applied", async () => {
    stubFetch().reply(interpretation({ eventDate: "2026-10-20" }));
    const { user, preview, onUpdate } = setup();
    await preview("move it to 20 October");
    await user.click(await screen.findByRole("button", { name: "Apply to my plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The event date has to be after today.");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply to my plan" })).toBeInTheDocument();
  });

  it("gives a general message when saving fails for another reason", async () => {
    stubFetch().reply(interpretation({ guestCount: 250 }));
    const props = panelProps(weddingPlan());
    props.onUpdate.mockImplementation(() => {
      throw new Error("storage exploded");
    });
    const { user, preview } = setup(props);
    await preview();
    await user.click(await screen.findByRole("button", { name: "Apply to my plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That change couldn't be applied.");
  });

  // Regression: after a failed preview, the previous proposal stayed on screen with
  // its "Apply" button, inviting the user to apply a change they had replaced.
  it("doesn't offer a stale proposal after a later preview fails", async () => {
    const api = stubFetch();
    api.reply(interpretation({ guestCount: 250 }));
    const { user, preview } = setup();
    await preview();
    await screen.findByText("Guests: 200 → 250");
    api.reply({ error: "Too many requests. Wait a moment and try again." }, 429);
    await user.clear(screen.getByLabelText("What changed"));
    await preview("actually 300 guests");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.queryByText("Guests: 200 → 250")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply to my plan" })).not.toBeInTheDocument();
  });

  it("waits for a message and shows progress while reading it", async () => {
    const release = stubFetch().pending();
    const { user, preview } = setup();
    expect(screen.getByRole("button", { name: "Preview the changes" })).toBeDisabled();
    await user.type(screen.getByLabelText("What changed"), "  ");
    expect(screen.getByRole("button", { name: "Preview the changes" })).toBeDisabled();
    await user.clear(screen.getByLabelText("What changed"));
    await preview();
    expect(screen.getByRole("button", { name: "Reading…" })).toBeDisabled();
    release(interpretation({ guestCount: 250 }));
    expect(await screen.findByText("Guests: 200 → 250")).toBeInTheDocument();
  });

  describe("editing the details directly", () => {
    it("applies the edited figures", async () => {
      const { user, onUpdate } = setup();
      await user.click(screen.getByText("Or edit the details directly"));
      await user.clear(screen.getByLabelText("Guests"));
      await user.type(screen.getByLabelText("Guests"), "180");
      await user.clear(screen.getByLabelText("Total budget (₹)"));
      await user.type(screen.getByLabelText("Total budget (₹)"), "750000");
      await user.clear(screen.getByLabelText("Event date"));
      await user.type(screen.getByLabelText("Event date"), "2027-04-10");
      await user.selectOptions(screen.getByLabelText("Experience"), "Premium");
      await user.click(screen.getByRole("button", { name: "Update the plan" }));
      expect(onUpdate.mock.calls[0][0].plan.brief).toMatchObject({
        guestCount: 180, totalBudget: 750_000, eventDate: "2027-04-10", tier: "premium",
      });
    });

    it("keeps the current values for fields left blank", async () => {
      const { user, onUpdate, plan } = setup();
      await user.click(screen.getByText("Or edit the details directly"));
      await user.clear(screen.getByLabelText("Guests"));
      await user.clear(screen.getByLabelText("Total budget (₹)"));
      await user.clear(screen.getByLabelText("Event date"));
      await user.click(screen.getByRole("button", { name: "Update the plan" }));
      expect(onUpdate.mock.calls[0][0].plan.brief).toEqual(plan.brief);
    });

    it("shows the domain's reason when the edit is refused", async () => {
      const props = panelProps(weddingPlan());
      props.onUpdate.mockImplementation(() => {
        throw new PlanError("Refused for a reason.");
      });
      const { user } = setup(props);
      await user.click(screen.getByText("Or edit the details directly"));
      await user.click(screen.getByRole("button", { name: "Update the plan" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Refused for a reason.");
    });
  });
});
