import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addGuest } from "@/lib/domain/guests";
import type { Guest, Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { panelProps, weddingPlan } from "@/test/plan";
import { GuestsPanel } from "./GuestsPanel";

const invited = (...guests: Guest[]) => guests.reduce((plan, g) => addGuest(plan, g), weddingPlan());
const guest = (id: string, name: string, partySize: number, rsvp: Guest["rsvp"]): Guest => ({
  id,
  name,
  partySize,
  rsvp,
});

/** `count` invitations of `size` people each, all with the same reply. */
const families = (count: number, size: number, rsvp: Guest["rsvp"]) =>
  Array.from({ length: count }, (_, i) => guest(`f${i}`, `Family ${i + 1}`, size, rsvp));

function setup(plan: Plan, props = panelProps(plan)) {
  const user = userEvent.setup();
  return { ...render(<GuestsPanel {...props} />), ...props, user };
}

describe("GuestsPanel", () => {
  it("starts with an invitation to add the first household", () => {
    setup(weddingPlan());
    expect(screen.getByText(/^No invitations yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("totals replies by people and lists each invitation", async () => {
    const plan = invited(guest("g1", "The Sharmas", 4, "yes"), guest("g2", "Priya", 1, "no"));
    const { container } = setup(plan);
    expect(screen.getByText(/^2 invitations for 5 people/)).toHaveTextContent(
      "2 invitations for 5 people: 4 coming, 1 not coming, 0 yet to reply.",
    );
    const sharmas = screen.getByRole("rowheader", { name: "The Sharmas" }).closest("tr")!;
    expect(within(sharmas).getByText("4")).toBeInTheDocument();
    expect(within(sharmas).getByLabelText("Reply from The Sharmas")).toHaveValue("yes");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("speaks of a single invitation in the singular", () => {
    setup(invited(guest("g1", "Priya", 1, "pending")));
    expect(screen.getByText(/^1 invitation for 1 people/)).toBeInTheDocument();
  });

  it("adds an invitation awaiting a reply, then clears the form", async () => {
    const { user, onChange } = setup(weddingPlan());
    await user.type(screen.getByLabelText("Invitation (household or group)"), " The Iyers ");
    await user.clear(screen.getByLabelText("People"));
    await user.type(screen.getByLabelText("People"), "3");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    expect(onChange.mock.lastCall![0].guests).toEqual([
      { id: expect.any(String), name: "The Iyers", partySize: 3, rsvp: "pending" },
    ]);
    expect(screen.getByLabelText("Invitation (household or group)")).toHaveValue("");
    expect(screen.getByLabelText("People")).toHaveValue(2);
  });

  it("explains an invitation the plan refuses, keeping what was typed", async () => {
    const { user, onChange } = setup(weddingPlan());
    await user.type(screen.getByLabelText("Invitation (household or group)"), "The Iyers");
    await user.clear(screen.getByLabelText("People"));
    await user.type(screen.getByLabelText("People"), "80");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("An invitation needs a name and a party size from 1 to 50.");
    expect(screen.getByLabelText("Invitation (household or group)")).toHaveValue("The Iyers");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives a general message when adding fails for another reason", async () => {
    const plan = weddingPlan();
    const props = panelProps(plan);
    props.onChange.mockImplementation(() => {
      throw new Error("storage exploded");
    });
    const { user } = setup(plan, props);
    await user.type(screen.getByLabelText("Invitation (household or group)"), "The Iyers");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't add the invitation.");
  });

  it("records a reply, and removes an invitation as an undoable change", async () => {
    const { user, onChange, onUpdate } = setup(invited(guest("g1", "The Sharmas", 4, "pending")));
    await user.selectOptions(screen.getByLabelText("Reply from The Sharmas"), "Not coming");
    expect(onChange.mock.lastCall![0].guests[0]!.rsvp).toBe("no");

    await user.click(screen.getByRole("button", { name: "Remove The Sharmas" }));
    const [update, heading] = onUpdate.mock.lastCall!;
    expect(heading).toBe("The Sharmas removed from the guest list");
    expect(update.plan.guests).toEqual([]);
  });

  describe("headcount", () => {
    it("offers to plan for everyone who hasn't declined, through the usual re-planning", async () => {
      const plan = invited(...families(4, 35, "yes"), guest("g9", "Office", 50, "pending"));
      const { user, onUpdate } = setup(plan);
      expect(screen.getByText(/^Your plan is for 200 guests\. Up to 190 could come/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Plan for 190 guests" }));
      const [update, heading] = onUpdate.mock.lastCall!;
      expect(heading).toBe("Plan revised");
      expect(update.plan.brief.guestCount).toBe(190);
      expect(update.effects[0]!.message).toBe("Guests: 200 → 190");
    });

    it.each([
      ["already matches the plan", families(4, 50, "pending")],
      ["would be zero because everyone declined", [guest("g1", "Priya", 2, "no")]],
    ])("isn't offered when the count %s", (_, guests) => {
      setup(invited(...guests));
      expect(screen.queryByRole("button", { name: /^Plan for/ })).not.toBeInTheDocument();
    });

    it.each([
      ["the plan refuses it", () => {}, "The event date has to be after today.", "2027-03-01"],
      [
        "saving fails for another reason",
        () => {
          throw new Error("storage exploded");
        },
        "The headcount couldn't be changed.",
        "2026-10-25",
      ],
    ])("explains when %s", async (_, onUpdateImpl, message, today) => {
      const plan = invited(guest("g1", "The Sharmas", 10, "yes"));
      const props = panelProps(plan, today);
      props.onUpdate.mockImplementation(onUpdateImpl);
      const { user } = setup(plan, props);
      await user.click(screen.getByRole("button", { name: "Plan for 10 guests" }));
      expect(screen.getByRole("alert")).toHaveTextContent(message);
    });
  });
});
