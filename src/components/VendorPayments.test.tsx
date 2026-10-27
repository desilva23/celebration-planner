import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addPayment, bookVendor, upsertVendor } from "@/lib/domain/vendors";
import type { Payment, Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { panelProps, vendor, weddingPlan } from "@/test/plan";
import { VendorPanel } from "./VendorPanel";

const advance: Payment = { id: "pay1", label: "Advance", amount: 50_000, dueDate: "2026-10-20", paid: false };
const balance: Payment = { id: "pay2", label: "Balance", amount: 100_000, dueDate: "2027-02-20", paid: true };

function bookedPlan(...payments: Payment[]): Plan {
  let plan = bookVendor(upsertVendor(weddingPlan(), vendor({ quote: 150_000, status: "quoted" })), "v1").plan;
  for (const payment of payments) plan = addPayment(plan, "v1", payment).plan;
  return plan;
}

function setup(plan: Plan, props = panelProps(plan)) {
  const user = userEvent.setup();
  return { ...render(<VendorPanel {...props} />), ...props, user };
}

const payments = () => within(screen.getByRole("heading", { name: "Payments to Lotus Hall" }).parentElement!);

describe("vendor payments", () => {
  it("lists each payment with what is paid and what is overdue", async () => {
    const { container } = setup(bookedPlan(advance, balance));
    const advanceBox = payments().getByRole("checkbox", { name: "Paid: Advance, ₹50,000, due 20 Oct 2026" });
    expect(advanceBox).not.toBeChecked();
    expect(advanceBox.closest("li")).toHaveTextContent("Overdue");
    const balanceBox = payments().getByRole("checkbox", { name: "Paid: Balance, ₹1,00,000, due 20 Feb 2027" });
    expect(balanceBox).toBeChecked();
    expect(balanceBox.closest("li")).not.toHaveTextContent("Overdue");
    expect(payments().getByText("Paid ₹1,00,000 of ₹1,50,000 scheduled.")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("invites the first payment on a fresh booking", () => {
    setup(bookedPlan());
    expect(payments().getByText(/None scheduled yet/)).toBeInTheDocument();
    expect(payments().getByLabelText("Payment")).toHaveValue("Advance");
  });

  it("schedules a payment as a reported change, then readies the form for the balance", async () => {
    const { user, onUpdate } = setup(bookedPlan());
    await user.clear(payments().getByLabelText("Payment"));
    await user.type(payments().getByLabelText("Payment"), "  Booking token ");
    await user.type(payments().getByLabelText("Amount (₹)"), "50000");
    await user.type(payments().getByLabelText("Due"), "2026-11-15");
    await user.click(payments().getByRole("button", { name: "Add payment" }));
    const [update, heading] = onUpdate.mock.calls[0]!;
    expect(heading).toBe("Payment to Lotus Hall scheduled");
    expect(update.plan.vendors[0]!.payments).toEqual([
      { id: expect.any(String), label: "Booking token", amount: 50_000, dueDate: "2026-11-15", paid: false },
    ]);
    expect(payments().getByLabelText("Payment")).toHaveValue("Balance");
    expect(payments().getByLabelText("Amount (₹)")).toHaveValue(null);
  });

  it("explains a payment the plan refuses, keeping what was typed", async () => {
    const { user, onUpdate } = setup(bookedPlan());
    await user.type(payments().getByLabelText("Amount (₹)"), "50000");
    await user.click(payments().getByRole("button", { name: "Add payment" }));
    expect(payments().getByRole("alert")).toHaveTextContent(
      "A payment needs a name, an amount above ₹0 and a real due date.",
    );
    expect(payments().getByLabelText("Amount (₹)")).toHaveValue(50_000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("gives a general message when scheduling fails for another reason", async () => {
    const plan = bookedPlan();
    const props = panelProps(plan);
    props.onUpdate.mockImplementation(() => {
      throw new Error("storage exploded");
    });
    const { user } = setup(plan, props);
    await user.type(payments().getByLabelText("Amount (₹)"), "50000");
    await user.type(payments().getByLabelText("Due"), "2026-11-15");
    await user.click(payments().getByRole("button", { name: "Add payment" }));
    expect(payments().getByRole("alert")).toHaveTextContent("Couldn't schedule the payment.");
  });

  it("marks a payment paid, and removes one as an undoable change", async () => {
    const { user, onChange, onUpdate } = setup(bookedPlan(advance));
    await user.click(payments().getByRole("checkbox", { name: /^Paid: Advance/ }));
    expect(onChange.mock.lastCall![0].vendors[0]!.payments[0]!.paid).toBe(true);

    await user.click(payments().getByRole("button", { name: "Remove Advance payment" }));
    const [update, heading] = onUpdate.mock.lastCall!;
    expect(heading).toBe("Payment removed");
    expect(update.plan.vendors[0]!.payments).toEqual([]);
  });

  it("keeps payments visible after a booking with payments is cancelled", () => {
    const plan = bookedPlan(advance);
    setup({ ...plan, vendors: plan.vendors.map((v) => ({ ...v, status: "quoted" as const })) });
    expect(screen.getByRole("heading", { name: "Payments to Lotus Hall" })).toBeInTheDocument();
  });

  it("isn't offered before a vendor is booked", () => {
    setup(upsertVendor(weddingPlan(), vendor({ quote: 150_000, status: "quoted" })));
    expect(screen.queryByRole("heading", { name: /^Payments to/ })).not.toBeInTheDocument();
  });

  it("doesn't call a payment overdue before its due date", () => {
    render(<VendorPanel {...panelProps(bookedPlan(advance), "2026-10-01")} />);
    expect(screen.getByRole("checkbox", { name: /^Paid: Advance/ }).closest("li")).not.toHaveTextContent("Overdue");
  });
});
