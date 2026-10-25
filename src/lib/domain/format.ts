const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const longDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatInr(amount: number): string {
  // `|| 0` folds -0 into 0 so it never renders as "-₹0".
  return inr.format(amount || 0);
}

export function formatDate(iso: string): string {
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}
