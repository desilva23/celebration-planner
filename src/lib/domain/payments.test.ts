import { describe, expect, it } from "vitest";
import { TODAY } from "./fixtures.test-helpers";
import { summarisePayments } from "./payments";
import type { Payment, Vendor } from "./schema";

const payment = (id: string, amount: number, dueDate: string, paid = false): Payment => ({
  id,
  label: id,
  amount,
  dueDate,
  paid,
});

const vendor = (name: string, payments: Payment[]): Vendor => ({
  id: name,
  category: "venue",
  name,
  contact: "",
  quote: null,
  status: "booked",
  notes: "",
  payments,
});

describe("summarisePayments", () => {
  it("totals what is scheduled and paid, and finds what is overdue and due next", () => {
    const summary = summarisePayments(
      [
        vendor("Lotus Hall", [
          payment("advance", 50_000, "2026-10-01", true),
          payment("balance", 100_000, "2027-02-20"),
        ]),
        vendor("Annapoorna", [
          payment("deposit", 30_000, "2026-10-20"),
          payment("token", 5_000, "2026-09-30"),
          payment("final", 200_000, TODAY),
        ]),
      ],
      TODAY,
    );
    expect(summary.scheduled).toBe(385_000);
    expect(summary.paid).toBe(50_000);
    expect(summary.overdue.map((p) => p.payment.id)).toEqual(["token", "deposit"]);
    expect(summary.next).toEqual({ vendor: "Annapoorna", payment: payment("final", 200_000, TODAY) });
  });

  it("has nothing due once everything is paid, or when nothing is scheduled", () => {
    expect(summarisePayments([vendor("Lotus Hall", [payment("advance", 1, "2026-10-01", true)])], TODAY)).toMatchObject(
      {
        overdue: [],
        next: null,
      },
    );
    expect(summarisePayments([], TODAY)).toEqual({ scheduled: 0, paid: 0, overdue: [], next: null });
  });
});
