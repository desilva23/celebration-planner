import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { runSheetFallback } from "@/lib/ai/fallbacks";
import { bookVendor, upsertVendor } from "@/lib/domain/vendors";
import type { Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { stubFetch } from "@/test/fetch";
import { vendor, weddingPlan } from "@/test/plan";
import { RunSheetPanel } from "./RunSheetPanel";

const envelope = (plan: Plan, reminders = true) => {
  const data = runSheetFallback({ brief: plan.brief, startTime: "18:00", vendors: [] });
  return { source: "fallback", notice: "Built in.", data: reminders ? data : { ...data, reminders: [] } };
};

describe("RunSheetPanel", () => {
  it("drafts a timetable from the plan, sending only booked vendors", async () => {
    let plan = upsertVendor(weddingPlan(), vendor({ quote: 150_000, status: "quoted" }));
    plan = bookVendor(plan, "v1").plan;
    plan = upsertVendor(plan, vendor({ id: "v2", name: "Maybe Caterers", category: "catering", quote: 1 }));
    const api = stubFetch();
    api.reply(envelope(plan));
    const { container } = render(<RunSheetPanel plan={plan} />);

    expect(screen.getByLabelText("Guests arrive at")).toHaveValue("18:00");
    await userEvent.click(screen.getByRole("button", { name: "Draft a run sheet" }));

    const table = await screen.findByRole("table", { name: "Run sheet for Anu & Ravi's wedding" });
    const arrival = within(table)
      .getByRole("rowheader", { name: /^Guests arrive/ })
      .closest("tr")!;
    expect(
      within(arrival)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["18:00", "Hosts"]);
    expect(screen.getByRole("heading", { name: "Reminders" })).toBeInTheDocument();
    expect(screen.getByText("Built-in suggestion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft again" })).toBeInTheDocument();
    expect(api.sent()[0]!).toEqual({
      url: "/api/run-sheet",
      body: { brief: plan.brief, startTime: "18:00", vendors: [{ category: "venue", name: "Lotus Hall" }] },
    });
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each([
    ["birthday", "17:00"],
    ["anniversary", "19:00"],
    ["community", "10:00"],
    ["other", "18:00"],
  ] as const)("suggests a usual start time for a %s", (eventType, time) => {
    render(<RunSheetPanel plan={weddingPlan({ eventType })} />);
    expect(screen.getByLabelText("Guests arrive at")).toHaveValue(time);
  });

  it("uses the arrival time the user sets, and needs one", async () => {
    const api = stubFetch();
    const user = userEvent.setup();
    render(<RunSheetPanel plan={weddingPlan()} />);
    const time = screen.getByLabelText("Guests arrive at");
    await user.clear(time);
    expect(screen.getByRole("button", { name: "Draft a run sheet" })).toBeDisabled();
    await user.type(time, "07:30");
    const release = api.pending();
    await user.click(screen.getByRole("button", { name: "Draft a run sheet" }));
    expect(screen.getByRole("button", { name: "Drafting…" })).toBeDisabled();
    expect((api.sent()[0]!.body as { startTime: string }).startTime).toBe("07:30");
    release(envelope(weddingPlan(), false));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reminders" })).not.toBeInTheDocument();
  });

  it("copies the sheet as plain text to paste into a message", async () => {
    const api = stubFetch();
    api.reply(envelope(weddingPlan()));
    const user = userEvent.setup();
    render(<RunSheetPanel plan={weddingPlan()} />);
    await user.click(screen.getByRole("button", { name: "Draft a run sheet" }));
    await user.click(await screen.findByRole("button", { name: "Copy as text" }));
    expect(await screen.findByText("Copied. Paste it into a message or a document.")).toBeInTheDocument();
    const text = await navigator.clipboard.readText();
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Anu & Ravi's wedding: run sheet",
      "15:00  Venue opens for setup (Venue staff). Seating and stage go in; check step-free access.",
    ]);
    expect(text).toContain("\n\nReminders:\n- Share this run sheet");

    // A new draft hasn't been copied yet, so the old confirmation goes.
    api.reply(envelope(weddingPlan()));
    await user.click(screen.getByRole("button", { name: "Draft again" }));
    expect(screen.queryByText(/^Copied\./)).not.toBeInTheDocument();
  });

  it("copies just the steps when there are no reminders", async () => {
    stubFetch().reply(envelope(weddingPlan(), false));
    const user = userEvent.setup();
    render(<RunSheetPanel plan={weddingPlan()} />);
    await user.click(screen.getByRole("button", { name: "Draft a run sheet" }));
    await user.click(await screen.findByRole("button", { name: "Copy as text" }));
    await screen.findByText(/^Copied\./);
    expect(await navigator.clipboard.readText()).not.toContain("Reminders");
  });

  it("explains when copying isn't allowed", async () => {
    stubFetch().reply(envelope(weddingPlan()));
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    render(<RunSheetPanel plan={weddingPlan()} />);
    await user.click(screen.getByRole("button", { name: "Draft a run sheet" }));
    await user.click(await screen.findByRole("button", { name: "Copy as text" }));
    expect(await screen.findByText(/^Couldn’t copy automatically/)).toBeInTheDocument();
  });

  it("reports a failed request", async () => {
    stubFetch().reply({ error: "Too many requests. Wait a moment and try again." }, 429);
    render(<RunSheetPanel plan={weddingPlan()} />);
    await userEvent.click(screen.getByRole("button", { name: "Draft a run sheet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
  });
});
