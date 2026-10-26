import type { Payment, Vendor } from "./schema";

export interface DuePayment {
  vendor: string;
  payment: Payment;
}

export interface PaymentSummary {
  /** Everything scheduled, paid or not. */
  scheduled: number;
  paid: number;
  /** Unpaid payments past their due date, earliest first. */
  overdue: DuePayment[];
  /** The earliest unpaid payment due today or later. */
  next: DuePayment | null;
}

const total = (payments: DuePayment[]) => payments.reduce((sum, p) => sum + p.payment.amount, 0);

export function summarisePayments(vendors: Vendor[], today: string): PaymentSummary {
  const all = vendors.flatMap((v) => v.payments.map((payment) => ({ vendor: v.name, payment })));
  const unpaid = all.filter((p) => !p.payment.paid).sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate));
  return {
    scheduled: total(all),
    paid: total(all.filter((p) => p.payment.paid)),
    overdue: unpaid.filter((p) => p.payment.dueDate < today),
    next: unpaid.find((p) => p.payment.dueDate >= today) ?? null,
  };
}
