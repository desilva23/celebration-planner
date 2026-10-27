"use client";

import { useState } from "react";
import { formatInr } from "@/lib/domain/format";
import { PlanError, type PlanUpdate } from "@/lib/domain/plan";
import type { BudgetLine, CategoryId, Plan, Vendor } from "@/lib/domain/schema";
import {
  addPayment,
  bookVendor,
  cancelBooking,
  removePayment,
  removeVendor,
  setPaymentPaid,
  upsertVendor,
} from "@/lib/domain/vendors";
import { AddVendor } from "./AddVendor";
import type { PanelProps } from "./PlanDashboard";
import { QuoteComparison } from "./QuoteComparison";
import { categoryLabel, ErrorMessage, Section } from "./ui";
import { VendorBrief } from "./VendorBrief";
import type { PaymentActions } from "./VendorPayments";
import { VendorRow, type VendorRowProps } from "./VendorRow";

export function VendorPanel({ plan, today, onChange, onUpdate }: PanelProps) {
  const categories = plan.budget.map((l) => l.category).filter((c) => c !== "contingency");
  const [category, setCategory] = useState<CategoryId>(categories[0] ?? "venue");
  const { bookingError, rowActions } = useVendorActions(plan, onChange, onUpdate);
  const line = plan.budget.find((l) => l.category === category);
  const vendors = plan.vendors.filter((v) => v.category === category);
  const save = (v: Vendor) => onChange(upsertVendor(plan, v));

  return (
    <Section
      id="vendors"
      title="Vendors"
      intro="Only vendors you have actually contacted go here. The planner never invents businesses, prices or availability."
    >
      <CategoryPicker categories={categories} category={category} line={line} onPick={setCategory} />
      <VendorBrief key={`brief-${category}`} plan={plan} category={category} budgetForCategory={line?.amount ?? 0} />

      <h3>Your {categoryLabel(category).toLowerCase()} vendors</h3>
      {bookingError && <ErrorMessage>{bookingError}</ErrorMessage>}
      {vendors.length === 0 ? (
        <p className="hint">None yet. Add one below once you’ve been in touch.</p>
      ) : (
        <ul className="vendor-list">
          {vendors.map((vendor) => (
            <VendorRow
              key={`${vendor.id}-${vendor.quote}-${vendor.status}`}
              vendor={vendor}
              today={today}
              {...rowActions(vendor)}
            />
          ))}
        </ul>
      )}
      <AddVendor key={`add-${category}`} category={category} onAdd={save} />

      <QuoteComparison
        key={`compare-${category}`}
        plan={plan}
        category={category}
        budgetForCategory={line?.amount ?? 0}
        onSave={save}
      />
    </Section>
  );
}

function CategoryPicker({
  categories,
  category,
  line,
  onPick,
}: {
  categories: CategoryId[];
  category: CategoryId;
  line?: BudgetLine;
  onPick: (category: CategoryId) => void;
}) {
  return (
    <div className="field inline">
      <label htmlFor="vendor-category">Vendor type</label>
      <select id="vendor-category" value={category} onChange={(e) => onPick(e.target.value as CategoryId)}>
        {categories.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)}
          </option>
        ))}
      </select>
      {line && (
        <span className="hint">
          Planned: {formatInr(line.amount)} ({line.source === "confirmed" ? "confirmed" : "estimate"})
        </span>
      )}
    </div>
  );
}

/** What each vendor row can do, and why the plan refused a booking change, if it did. */
function useVendorActions(plan: Plan, onChange: PanelProps["onChange"], onUpdate: PanelProps["onUpdate"]) {
  const [bookingError, setBookingError] = useState<string | null>(null);

  /** The plan can refuse a booking change (no quote yet, for example); say why. */
  function changeBooking(change: () => PlanUpdate, heading: string) {
    try {
      onUpdate(change(), heading);
      setBookingError(null);
    } catch (error) {
      setBookingError(error instanceof PlanError ? error.message : "Couldn't update the booking.");
    }
  }

  function payments(vendor: Vendor): PaymentActions {
    return {
      schedule(payment) {
        try {
          onUpdate(addPayment(plan, vendor.id, payment), `Payment to ${vendor.name} scheduled`);
          return null;
        } catch (error) {
          return error instanceof PlanError ? error.message : "Couldn't schedule the payment.";
        }
      },
      setPaid: (paymentId, paid) => onChange(setPaymentPaid(plan, { vendorId: vendor.id, paymentId }, paid)),
      remove: (paymentId) =>
        onUpdate({ plan: removePayment(plan, { vendorId: vendor.id, paymentId }), effects: [] }, "Payment removed"),
    };
  }

  const rowActions = (vendor: Vendor): Omit<VendorRowProps, "vendor" | "today"> => ({
    payments: payments(vendor),
    onSave: (v) => onChange(upsertVendor(plan, v)),
    onBook: () => changeBooking(() => bookVendor(plan, vendor.id), `${vendor.name} booked`),
    onCancel: () => changeBooking(() => cancelBooking(plan, vendor.id), `${vendor.name} booking cancelled`),
    onRemove: () => onUpdate({ plan: removeVendor(plan, vendor.id), effects: [] }, `${vendor.name} removed`),
  });

  return { bookingError, rowActions };
}
