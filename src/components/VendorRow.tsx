"use client";

import { useState, type SubmitEvent } from "react";
import { formatInr } from "@/lib/domain/format";
import type { Vendor } from "@/lib/domain/schema";
import { VendorPayments, type PaymentActions } from "./VendorPayments";

export interface VendorRowProps {
  vendor: Vendor;
  today: string;
  payments: PaymentActions;
  onSave: (v: Vendor) => void;
  onBook: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

/** One vendor: who they are, what they quoted, and what can be done next. */
export function VendorRow({ vendor, today, payments, onSave, onBook, onCancel, onRemove }: VendorRowProps) {
  return (
    <li className="vendor">
      <div>
        <strong>{vendor.name}</strong>
        <StatusBadge status={vendor.status} />
        {vendor.contact && <p className="hint">{vendor.contact}</p>}
        {vendor.notes && <p className="hint">{vendor.notes}</p>}
      </div>
      {vendor.status === "booked" ? (
        <BookedActions vendor={vendor} onCancel={onCancel} />
      ) : (
        <OpenActions vendor={vendor} onSave={onSave} onBook={onBook} onRemove={onRemove} />
      )}
      {/* Payments belong to bookings, but stay visible if a booking with payments is cancelled. */}
      {(vendor.status === "booked" || vendor.payments.length > 0) && (
        <VendorPayments vendor={vendor} today={today} actions={payments} />
      )}
    </li>
  );
}

const STATUS_LABEL: Record<Vendor["status"], string> = {
  booked: "Booked",
  quoted: "Quoted",
  considering: "Considering",
};

function StatusBadge({ status }: { status: Vendor["status"] }) {
  return <span className={`badge ${status === "booked" ? "ok" : "muted"}`}>{STATUS_LABEL[status]}</span>;
}

/** Not booked yet: record a quote, book, or remove. */
function OpenActions({
  vendor,
  onSave,
  onBook,
  onRemove,
}: Pick<VendorRowProps, "vendor" | "onSave" | "onBook" | "onRemove">) {
  const [quote, setQuote] = useState(vendor.quote === null ? "" : String(vendor.quote));
  const quoteId = `quote-${vendor.id}`;

  function saveQuote(event: SubmitEvent) {
    event.preventDefault();
    const amount = Math.round(Number(quote));
    if (quote.trim() && Number.isSafeInteger(amount) && amount >= 0)
      onSave({ ...vendor, quote: amount, status: "quoted" });
  }

  return (
    <div className="vendor-actions">
      <form onSubmit={saveQuote} className="inline-form">
        <label htmlFor={quoteId}>Their quote (₹)</label>
        <input
          id={quoteId}
          type="number"
          inputMode="numeric"
          min={0}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
        />
        <button type="submit" className="button ghost small">
          Save quote
        </button>
      </form>
      <button type="button" className="button primary small" onClick={onBook} disabled={vendor.quote === null}>
        Mark as booked
      </button>
      <button type="button" className="button ghost small" onClick={onRemove}>
        Remove <span className="visually-hidden">{vendor.name}</span>
      </button>
    </div>
  );
}

function BookedActions({ vendor, onCancel }: Pick<VendorRowProps, "vendor" | "onCancel">) {
  return (
    <div className="vendor-actions">
      {/* Never show ₹0 as a confirmed price for a booking with no recorded quote. */}
      {vendor.quote !== null && <p>{formatInr(vendor.quote)} confirmed</p>}
      <button type="button" className="button ghost small" onClick={onCancel}>
        Cancel booking <span className="visually-hidden">with {vendor.name}</span>
      </button>
    </div>
  );
}
