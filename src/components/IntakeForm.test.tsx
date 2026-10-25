import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterpretResult } from "@/lib/ai/contracts";
import type { Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { stubFetch } from "@/test/fetch";
import { freezeToday } from "@/test/plan";
import { IntakeForm } from "./IntakeForm";

const NO_UPDATES: InterpretResult["updates"] = {
  eventType: null, title: null, eventDate: null, guestCount: null, totalBudget: null,
  tier: null, city: null, priorities: null, notes: null,
};

function setup() {
  const onCreate = vi.fn<(plan: Plan) => void>();
  const user = userEvent.setup();
  const view = render(<IntakeForm onCreate={onCreate} />);
  const field = (label: string | RegExp) => screen.getByLabelText(label);
  async function fillRequired(date = "2027-03-01", guests = "200", budget = "800000") {
    await user.type(field("Event date"), date);
    await user.type(field("Expected guests"), guests);
    await user.type(field("Total budget (₹)"), budget);
  }
  const submit = () => user.click(screen.getByRole("button", { name: "Build my plan" }));
  return { ...view, onCreate, user, field, fillRequired, submit };
}

beforeEach(() => {
  freezeToday();
});

describe("IntakeForm", () => {
  it("builds a plan from the details, naming it after the occasion when left blank", async () => {
    const { user, field, fillRequired, submit, onCreate } = setup();
    await user.selectOptions(field("Occasion"), "birthday");
    await fillRequired("2027-01-15", "60", "150000");
    await user.type(field("City (optional)"), "Pune");
    await user.click(field("Premium: go big"));
    await user.click(screen.getByRole("checkbox", { name: "Catering" }));
    await user.click(screen.getByRole("checkbox", { name: "Decor" }));
    await user.type(field(/Anything else/), "Mostly kids");
    await submit();

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0][0].brief).toEqual({
      eventType: "birthday",
      title: "Birthday plan",
      eventDate: "2027-01-15",
      guestCount: 60,
      totalBudget: 150_000,
      tier: "premium",
      city: "Pune",
      priorities: ["catering", "decor"],
      notes: "Mostly kids",
    });
  });

  it("keeps a name the user gives", async () => {
    const { user, field, fillRequired, submit, onCreate } = setup();
    await user.type(field("Name for this plan"), "Anu & Ravi");
    await fillRequired();
    await submit();
    expect(onCreate.mock.calls[0][0].brief.title).toBe("Anu & Ravi");
  });

  it("lists every problem in a focused summary that links to each field", async () => {
    const { container, submit, onCreate, field } = setup();
    await submit();

    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Please fix these first:");
    await waitFor(() => expect(summary).toHaveFocus());
    const links = within(summary).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#field-eventDate", "#field-guestCount", "#field-totalBudget"]);
    expect(field("Expected guests")).toHaveAttribute("aria-invalid", "true");
    expect(field("Expected guests")).toHaveAccessibleDescription("Enter how many guests you expect, between 1 and 5,000.");
    expect(onCreate).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("asks for a date after today", async () => {
    const { fillRequired, submit, field } = setup();
    await fillRequired("2026-10-25");
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix this first:");
    expect(field("Event date")).toHaveAccessibleDescription("Pick a date after today.");
  });

  // Regression: an oversized budget used to be told it needed to be "at least ₹1,000".
  it("explains both budget limits when the budget is out of range", async () => {
    const { fillRequired, submit, field } = setup();
    await fillRequired(undefined, undefined, "200000000");
    await submit();
    expect(field("Total budget (₹)")).toHaveAccessibleDescription(
      "Enter your total budget in rupees, between ₹1,000 and ₹10,00,00,000.",
    );
  });

  it("shows one message per field even when several rules fail", async () => {
    const { fillRequired, submit } = setup();
    await fillRequired(undefined, "0.5");
    await submit();
    expect(screen.getAllByText("Enter how many guests you expect, between 1 and 5,000.")).toHaveLength(2);
  });

  it("reads the budget back in rupees as it's typed", async () => {
    const { user, field } = setup();
    expect(screen.getByText("In rupees, e.g. 800000 for ₹8 lakh")).toBeInTheDocument();
    await user.type(field("Total budget (₹)"), "800000");
    expect(field("Total budget (₹)")).toHaveAccessibleDescription("₹8,00,000");
  });

  it("caps priorities at four and frees the rest when one is unticked", async () => {
    const { user } = setup();
    const box = (name: string) => screen.getByRole("checkbox", { name });
    for (const name of ["Venue", "Catering", "Decor", "Photography"]) await user.click(box(name));
    expect(box("Attire")).toBeDisabled();
    await user.click(box("Venue"));
    expect(box("Attire")).toBeEnabled();
  });

  it("only offers priorities the occasion budgets for", async () => {
    const { user, field } = setup();
    expect(screen.getByRole("checkbox", { name: "Attire" })).toBeInTheDocument();
    await user.selectOptions(field("Occasion"), "community");
    expect(screen.queryByRole("checkbox", { name: "Attire" })).not.toBeInTheDocument();
  });

  describe("describing the event in words", () => {
    it("fills in the details it understood and asks about anything unclear", async () => {
      const api = stubFetch();
      api.reply({
        source: "fallback",
        notice: "AI isn't configured on this server, so this is a built-in suggestion.",
        data: {
          updates: {
            eventType: "anniversary", title: "Parents' 30th", eventDate: "2027-02-14", guestCount: 80, totalBudget: 300_000,
            tier: "simple", city: "Coimbatore", priorities: ["catering"], notes: "Vegetarian food",
          },
          understood: "Understood: an anniversary, 80 guests.",
          clarifyingQuestion: "Will most guests be elderly?",
        },
      });
      const { user, field } = setup();
      const describeBox = screen.getByLabelText("What are you planning?");
      await user.type(describeBox, "My parents' 30th anniversary");
      await user.click(screen.getByRole("button", { name: "Fill in the details below" }));

      expect(await screen.findByText(/Understood: an anniversary, 80 guests\. Check the details below/)).toBeInTheDocument();
      expect(screen.getByText("Built-in suggestion")).toBeInTheDocument();
      expect(screen.getByText("Will most guests be elderly?")).toBeInTheDocument();
      expect(api.sent()).toEqual([{ url: "/api/interpret", body: { message: "My parents' 30th anniversary", brief: null, today: "2026-10-25" } }]);
      expect(field("Occasion")).toHaveValue("anniversary");
      expect(field("Name for this plan")).toHaveValue("Parents' 30th");
      expect(field("Event date")).toHaveValue("2027-02-14");
      expect(field("Expected guests")).toHaveValue(80);
      expect(field("Total budget (₹)")).toHaveValue(300_000);
      expect(field("Simple: keep it modest")).toBeChecked();
      expect(field("City (optional)")).toHaveValue("Coimbatore");
      expect(screen.getByRole("checkbox", { name: "Catering" })).toBeChecked();
      expect(field(/Anything else/)).toHaveValue("Vegetarian food");
    });

    it("keeps what the user already entered for anything it didn't pick up", async () => {
      stubFetch().reply({ source: "ai", data: { updates: NO_UPDATES, understood: "Nothing specific.", clarifyingQuestion: null } });
      const { user, field } = setup();
      await user.type(field("Expected guests"), "120");
      await user.type(screen.getByLabelText("What are you planning?"), "something nice");
      await user.click(screen.getByRole("button", { name: "Fill in the details below" }));
      await screen.findByText(/Nothing specific\./);
      expect(field("Expected guests")).toHaveValue(120);
      expect(field("Occasion")).toHaveValue("wedding");
      expect(screen.queryByText("AI isn't configured", { exact: false })).not.toBeInTheDocument();
    });

    it("falls back to the validator's message for a field without its own", async () => {
      stubFetch().reply({
        source: "ai",
        data: {
          updates: { ...NO_UPDATES, priorities: ["venue", "catering", "decor", "photography", "attire"] },
          understood: "Five priorities.",
          clarifyingQuestion: null,
        },
      });
      const { user, fillRequired, submit } = setup();
      await user.type(screen.getByLabelText("What are you planning?"), "everything matters");
      await user.click(screen.getByRole("button", { name: "Fill in the details below" }));
      await screen.findByText(/Five priorities\./);
      await fillRequired();
      await submit();
      expect(within(screen.getByRole("alert")).getByRole("link", { name: /expected array to have <=4 items/i })).toBeInTheDocument();
    });

    it("flags filled-in notes that are over the limit, against the notes field", async () => {
      stubFetch().reply({
        source: "ai",
        data: { updates: { ...NO_UPDATES, notes: "n".repeat(1001) }, understood: "Long notes.", clarifyingQuestion: null },
      });
      const { user, field, fillRequired, submit } = setup();
      expect(field(/Anything else/)).toHaveAccessibleDescription(/^Guest ages, cultural/);
      await user.type(screen.getByLabelText("What are you planning?"), "lots of detail");
      await user.click(screen.getByRole("button", { name: "Fill in the details below" }));
      await screen.findByText(/Long notes\./);
      await fillRequired();
      await submit();
      expect(field(/Anything else/)).toHaveAccessibleDescription("Keep notes under 1,000 characters.");
    });

    it("waits for some text, shows progress and reports a failure", async () => {
      const api = stubFetch();
      const { user } = setup();
      const button = screen.getByRole("button", { name: "Fill in the details below" });
      expect(button).toBeDisabled();
      await user.type(screen.getByLabelText("What are you planning?"), "   ");
      expect(button).toBeDisabled();

      api.reply({ error: "Too many requests. Wait a moment and try again." }, 429);
      await user.type(screen.getByLabelText("What are you planning?"), "a wedding");
      await user.click(button);
      expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests. Wait a moment and try again.");
    });

    it("says it's reading while the request is in flight", async () => {
      const release = stubFetch().pending();
      const { user } = setup();
      await user.type(screen.getByLabelText("What are you planning?"), "a wedding");
      await user.click(screen.getByRole("button", { name: "Fill in the details below" }));
      expect(screen.getByRole("button", { name: "Reading…" })).toBeDisabled();
      release({ source: "ai", data: { updates: NO_UPDATES, understood: "Done.", clarifyingQuestion: null } });
      expect(await screen.findByText(/Done\./)).toBeInTheDocument();
    });
  });
});
