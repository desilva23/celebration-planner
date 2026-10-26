import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuoteSummary } from "@/lib/ai/contracts";
import { bookVendor, PlanError, upsertVendor } from "@/lib/domain/plan";
import type { Plan, Vendor } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { stubFetch } from "@/test/fetch";
import { panelProps, vendor, weddingPlan } from "@/test/plan";
import { VendorPanel } from "./VendorPanel";

function setup(plan: Plan = weddingPlan(), props = panelProps(plan)) {
  const user = userEvent.setup();
  return { ...render(<VendorPanel {...props} />), ...props, user };
}

const withVendors = (...vendors: Vendor[]) => vendors.reduce((plan, v) => upsertVendor(plan, v), weddingPlan());
const savedVendors = (onChange: ReturnType<typeof panelProps>["onChange"]) => onChange.mock.lastCall![0].vendors;

const quote = (overrides: Partial<QuoteSummary>): QuoteSummary => ({
  label: "Quote A",
  total: null,
  perGuest: null,
  guestsCovered: null,
  inclusions: [],
  extraCharges: [],
  terms: [],
  needsClarification: [],
  ...overrides,
});

describe("VendorPanel", () => {
  it("offers the budget's vendor types and shows what's planned for the chosen one", async () => {
    const { container, user } = setup();
    const type = screen.getByLabelText("Vendor type");
    expect(
      within(type)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Venue", "Catering", "Decor", "Photography", "Entertainment", "Attire", "Invitations", "Transport"]);
    expect(screen.getByText("Planned: ₹1,76,000 (estimate)")).toBeInTheDocument();
    expect(screen.getByText("None yet. Add one below once you’ve been in touch.")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await user.selectOptions(type, "catering");
    expect(screen.getByRole("heading", { name: "Your catering vendors" })).toBeInTheDocument();
    expect(screen.getByText("Planned: ₹2,56,000 (estimate)")).toBeInTheDocument();
    expect(screen.getByText("Add a catering vendor")).toBeInTheDocument();
  });

  describe("adding vendors", () => {
    it("records a vendor with the quote they gave, then clears the form", async () => {
      const { user, onChange } = setup();
      await user.click(screen.getByText("Add a venue vendor"));
      await user.type(screen.getByLabelText("Business name"), "  Lotus Hall ");
      await user.type(screen.getByLabelText("Contact (optional)"), "98400 00000");
      await user.type(screen.getByLabelText("Quoted price, if you have one (₹)"), "150000");
      await user.type(screen.getByLabelText("Notes (optional)"), "Has parking");
      await user.click(screen.getByRole("button", { name: "Add vendor" }));
      expect(savedVendors(onChange)).toEqual([
        {
          id: expect.stringMatching(/^\w{8}$/),
          category: "venue",
          name: "Lotus Hall",
          contact: "98400 00000",
          quote: 150_000,
          status: "quoted",
          notes: "Has parking",
        },
      ]);
      expect(screen.getByLabelText("Business name")).toHaveValue("");
    });

    it("records a vendor without a quote as one being considered", async () => {
      const { user, onChange } = setup();
      await user.type(screen.getByLabelText("Business name"), "Lotus Hall");
      await user.click(screen.getByRole("button", { name: "Add vendor" }));
      expect(savedVendors(onChange)[0]).toMatchObject({ quote: null, status: "considering" });
    });

    it("ignores a vendor with no name", async () => {
      const { user, onChange } = setup();
      await user.type(screen.getByLabelText("Business name"), "   ");
      await user.click(screen.getByRole("button", { name: "Add vendor" }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("a vendor in the plan", () => {
    it("shows its details and saves a quote once they give one", async () => {
      const { user, onChange } = setup(withVendors(vendor({ contact: "98400 00000", notes: "Has parking" })));
      expect(screen.getByText("Considering")).toBeInTheDocument();
      expect(screen.getByText("98400 00000")).toBeInTheDocument();
      expect(screen.getByText("Has parking")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mark as booked" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Save quote" }));
      expect(onChange).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText("Their quote (₹)"), "165000");
      await user.click(screen.getByRole("button", { name: "Save quote" }));
      expect(savedVendors(onChange)[0]).toMatchObject({ quote: 165_000, status: "quoted" });
    });

    it("books a quoted vendor, confirming its price", async () => {
      const { user, onUpdate } = setup(withVendors(vendor({ quote: 150_000, status: "quoted" })));
      expect(screen.getByText("Quoted")).toBeInTheDocument();
      expect(screen.getByLabelText("Their quote (₹)")).toHaveValue(150_000);
      await user.click(screen.getByRole("button", { name: "Mark as booked" }));
      const [update, heading] = onUpdate.mock.calls[0]!;
      expect(heading).toBe("Lotus Hall booked");
      expect(update.plan.budget.find((l) => l.category === "venue")).toMatchObject({
        amount: 150_000,
        source: "confirmed",
      });
    });

    it.each([
      [
        new PlanError("Record the vendor's quote before marking it booked."),
        "Record the vendor's quote before marking it booked.",
      ],
      [new Error("storage exploded"), "Couldn't record the booking."],
    ])("explains when a booking can't be recorded: %s", async (failure, message) => {
      const plan = withVendors(vendor({ quote: 150_000, status: "quoted" }));
      const props = panelProps(plan);
      props.onUpdate.mockImplementationOnce(() => {
        throw failure;
      });
      const { user } = setup(plan, props);
      await user.click(screen.getByRole("button", { name: "Mark as booked" }));
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      await user.click(screen.getByRole("button", { name: "Mark as booked" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("can be removed, with a button that names it, as a change that can be undone", async () => {
      const { user, onUpdate } = setup(withVendors(vendor(), vendor({ id: "v2", name: "Rose Garden" })));
      await user.click(screen.getByRole("button", { name: "Remove Lotus Hall" }));
      const [update, heading] = onUpdate.mock.calls[0]!;
      expect(heading).toBe("Lotus Hall removed");
      expect(update.plan.vendors.map((v: Vendor) => v.name)).toEqual(["Rose Garden"]);
    });

    it("shows a booked vendor's confirmed price instead of actions", () => {
      const plan = bookVendor(withVendors(vendor({ quote: 150_000, status: "quoted" })), "v1").plan;
      setup(plan);
      expect(screen.getByText("Booked")).toBeInTheDocument();
      expect(screen.getByText("₹1,50,000 confirmed")).toBeInTheDocument();
      expect(screen.getByText("Planned: ₹1,50,000 (confirmed)")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark as booked" })).not.toBeInTheDocument();
    });

    // Regression: a booking with no recorded quote was shown as "₹0 confirmed".
    it("never presents a missing price as a confirmed ₹0", () => {
      setup(withVendors(vendor({ status: "booked", quote: null })));
      expect(screen.getByText("Booked")).toBeInTheDocument();
      expect(screen.queryByText(/confirmed$/)).not.toBeInTheDocument();
    });
  });

  it("still works for a plan with no budget lines", async () => {
    const api = stubFetch();
    api.reply({ source: "fallback", data: { requirements: [], questions: [], watchOuts: [] } });
    const { user } = setup({ ...weddingPlan(), budget: [] });
    expect(screen.getByRole("heading", { name: "Your venue vendors" })).toBeInTheDocument();
    expect(screen.queryByText(/^Planned:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "What should I ask venue vendors?" }));
    await screen.findByText("Built-in suggestion");
    expect(api.sent()[0]!.body).toMatchObject({ category: "venue", budgetForCategory: 0 });
  });

  describe("what to ask vendors", () => {
    it("prepares requirements, questions and watch-outs for the vendor type", async () => {
      const api = stubFetch();
      const release = api.pending();
      const { user, plan } = setup();
      await user.click(screen.getByRole("button", { name: "What should I ask venue vendors?" }));
      expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
      release({
        source: "fallback",
        notice: "AI isn't configured on this server, so this is a built-in suggestion.",
        data: { requirements: ["200 guests"], questions: ["What is the capacity?"], watchOuts: ["Parking charges"] },
      });
      expect(await screen.findByRole("heading", { name: "What you need" })).toBeInTheDocument();
      expect(screen.getByText("What is the capacity?")).toBeInTheDocument();
      expect(screen.getByText("Parking charges")).toBeInTheDocument();
      expect(api.sent()[0]!).toEqual({
        url: "/api/vendor-brief",
        body: { category: "venue", brief: plan.brief, budgetForCategory: 176_000 },
      });
    });

    it("reports a failure", async () => {
      stubFetch().reply({ error: "The AI service didn't respond. Try again in a moment." }, 503);
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "What should I ask venue vendors?" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("The AI service didn't respond.");
    });
  });

  describe("comparing quotes", () => {
    async function openComparison(user: ReturnType<typeof userEvent.setup>) {
      await user.selectOptions(screen.getByLabelText("Vendor type"), "catering");
      await user.click(screen.getByText("Compare quotes you’ve received"));
    }

    it("waits for at least one quote with enough text to read", async () => {
      const { user } = setup();
      await openComparison(user);
      const compare = screen.getByRole("button", { name: "Compare" });
      expect(compare).toBeDisabled();
      await user.type(screen.getAllByLabelText("Quote text")[0]!, "too short");
      expect(compare).toBeDisabled();
      await user.type(screen.getAllByLabelText("Quote text")[0]!, " but now it is long enough");
      expect(compare).toBeEnabled();
    });

    it("lays the quotes side by side against the estimate, marking calculated totals", async () => {
      const api = stubFetch();
      api.reply({
        source: "ai",
        data: {
          quotes: [
            quote({
              label: "Annapoorna",
              total: 250_000,
              guestsCovered: 200,
              inclusions: ["Welcome drink"],
              extraCharges: ["GST 5%"],
              terms: ["50% advance"],
            }),
            quote({
              label: "Saravana",
              perGuest: 1_500,
              needsClarification: ["Confirm GST", "Ask about staff", "Check parking"],
            }),
            quote({ label: "Mystery" }),
          ],
        },
      });
      const { container, user } = setup();
      await openComparison(user);
      await user.clear(screen.getByLabelText("Name for quote 1"));
      await user.type(screen.getByLabelText("Name for quote 1"), "Annapoorna");
      await user.type(screen.getAllByLabelText("Quote text")[0]!, "Rs 2,50,000 for 200 guests, GST extra");
      await user.click(screen.getByRole("button", { name: "Compare" }));

      const table = await screen.findByRole("table", {
        name: /Quotes compared against your ₹2,56,000 catering estimate/,
      });
      const cells = (label: string) =>
        within(within(table).getByRole("rowheader", { name: label }).closest("tr")!).getAllByRole("cell");
      expect(
        cells("Annapoorna")
          .slice(0, 5)
          .map((c) => c.textContent),
      ).toEqual(["₹2,50,000 totalcovers 200", "₹2,50,000within estimate", "Welcome drink", "GST 5%", "50% advance"]);
      expect(
        cells("Saravana")
          .slice(0, 2)
          .map((c) => c.textContent),
      ).toEqual(["₹1,500 per guest", "₹3,00,000calculated₹44,000 over estimate"]);
      expect(
        cells("Mystery")
          .slice(0, 2)
          .map((c) => c.textContent),
      ).toEqual(["No price stated", "—"]);
      expect(api.sent()[0]!.body).toEqual({
        category: "catering",
        guestCount: 200,
        budgetForCategory: 256_000,
        quotes: [{ label: "Annapoorna", text: "Rs 2,50,000 for 200 guests, GST extra" }],
      });
      expect(await axeViolations(container)).toEqual([]);
    });

    it("saves a compared quote to the vendor list, with its open questions", async () => {
      stubFetch().reply({
        source: "ai",
        data: {
          quotes: [
            quote({
              label: "Saravana",
              perGuest: 1_500,
              needsClarification: ["Confirm GST.", "Ask about staff.", "Check parking."],
            }),
            quote({ label: "Mystery" }),
          ],
        },
      });
      const { user, onChange } = setup();
      await openComparison(user);
      await user.type(screen.getAllByLabelText("Quote text")[0]!, "Rs 1,500 per plate, minimum 180 plates");
      await user.click(screen.getByRole("button", { name: "Compare" }));
      await user.click(await screen.findByRole("button", { name: "Save to my vendors: Saravana" }));
      expect(savedVendors(onChange)[0]).toMatchObject({
        category: "catering",
        name: "Saravana",
        quote: 300_000,
        status: "quoted",
        notes: "Confirm GST. Ask about staff.",
      });
      await user.click(screen.getByRole("button", { name: "Save to my vendors: Mystery" }));
      expect(savedVendors(onChange)[0]).toMatchObject({ name: "Mystery", quote: null, status: "considering" });
    });

    it("takes up to four quotes", async () => {
      const { user } = setup();
      await openComparison(user);
      await user.click(screen.getByRole("button", { name: "Add another quote" }));
      await user.click(screen.getByRole("button", { name: "Add another quote" }));
      expect(screen.getAllByLabelText(/^Name for quote/).map((input) => (input as HTMLInputElement).value)).toEqual([
        "Quote A",
        "Quote B",
        "Quote C",
        "Quote D",
      ]);
      expect(screen.queryByRole("button", { name: "Add another quote" })).not.toBeInTheDocument();
    });

    // Regression: rows were keyed by label, so two quotes with the same name collided.
    it("shows two quotes with the same name as separate rows", async () => {
      const error = vi.spyOn(console, "error");
      stubFetch().reply({
        source: "ai",
        data: {
          quotes: [quote({ label: "Annapoorna", perGuest: 1_250 }), quote({ label: "Annapoorna", perGuest: 1_100 })],
        },
      });
      const { user } = setup();
      await openComparison(user);
      await user.type(screen.getAllByLabelText("Quote text")[0]!, "Rs 1,250 per plate for the basic menu");
      await user.click(screen.getByRole("button", { name: "Compare" }));
      expect(await screen.findAllByRole("rowheader", { name: "Annapoorna" })).toHaveLength(2);
      expect(error.mock.calls.filter(([message]) => String(message).includes("same key"))).toEqual([]);
    });

    it("offers manual entry when quotes can't be read", async () => {
      stubFetch().reply({ error: "AI isn't configured on this server." }, 503);
      const { user } = setup();
      await openComparison(user);
      await user.type(screen.getAllByLabelText("Quote text")[0]!, "Rs 1,250 per plate for 200 guests");
      await user.click(screen.getByRole("button", { name: "Compare" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "AI isn't configured on this server. You can still add vendors and quotes by hand above.",
      );
    });
  });
});
