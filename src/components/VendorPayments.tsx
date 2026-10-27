"use client";

import { useState, type SubmitEvent } from "react";
import { newId } from "@/lib/client/api";
import { formatDate, formatInr } from "@/lib/domain/format";
import type { Payment, Vendor } from "@/lib/domain/schema";
import { ErrorMessage } from "./ui";

export interface PaymentActions {
  /** Returns why the plan refused the payment, or null once it is scheduled. */
  schedule: (payment: Payment) => string | null;
  setPaid: (paymentId: string, paid: boolean) => void;
  remove: (paymentId: string) => void;
}

/** A vendor's payment schedule: advances and balances, and which are paid. */
export function VendorPayments({ vendor, today, actions }: { vendor: Vendor; today: string; actions: PaymentActions }) {
  const scheduled = vendor.payments.reduce((sum, p) => sum + p.amount, 0);
  const paid = vendor.payments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="payments">
      <h4>Payments to {vendor.name}</h4>
      {vendor.payments.length === 0 ? (
        <p className="hint">None scheduled yet. Add the advance and balance as the vendor asks for them.</p>
      ) : (
        <>
          <ul className="payment-list">
            {vendor.payments.map((payment) => {
              const id = `paid-${vendor.id}-${payment.id}`;
              return (
                <li key={payment.id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={payment.paid}
                    onChange={() => actions.setPaid(payment.id, !payment.paid)}
                  />
                  <label htmlFor={id}>
                    <span className="visually-hidden">Paid:</span> {payment.label}, {formatInr(payment.amount)}, due{" "}
                    {formatDate(payment.dueDate)}
                  </label>
                  {!payment.paid && payment.dueDate < today && <span className="badge overdue">Overdue</span>}
                  <button type="button" className="button ghost small" onClick={() => actions.remove(payment.id)}>
                    Remove <span className="visually-hidden">{payment.label} payment</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Paid {formatInr(paid)} of {formatInr(scheduled)} scheduled.
          </p>
        </>
      )}
      <AddPayment vendorId={vendor.id} onSchedule={actions.schedule} />
    </div>
  );
}

function AddPayment({ vendorId, onSchedule }: { vendorId: string; onSchedule: PaymentActions["schedule"] }) {
  const [label, setLabel] = useState("Advance");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const field = (name: string) => `payment-${name}-${vendorId}`;

  function submit(event: SubmitEvent) {
    event.preventDefault();
    // The plan validates the payment and explains anything it refuses.
    const refused = onSchedule({
      id: newId(),
      label: label.trim(),
      amount: Math.round(Number(amount)),
      dueDate,
      paid: false,
    });
    setProblem(refused);
    if (refused) return;
    setLabel("Balance");
    setAmount("");
    setDueDate("");
  }

  return (
    <form onSubmit={submit} className="inline-form payment-form" noValidate>
      <label htmlFor={field("label")}>Payment</label>
      <input id={field("label")} type="text" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
      <label htmlFor={field("amount")}>Amount (₹)</label>
      <input
        id={field("amount")}
        type="number"
        inputMode="numeric"
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <label htmlFor={field("due")}>Due</label>
      <input id={field("due")} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button type="submit" className="button ghost small">
        Add payment
      </button>
      {problem && <ErrorMessage>{problem}</ErrorMessage>}
    </form>
  );
}
