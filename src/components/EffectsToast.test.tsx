import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test/axe";
import { EffectsToast } from "./EffectsToast";

describe("EffectsToast", () => {
  it("is an empty live region until there's something to report", () => {
    render(<EffectsToast report={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("lists what moved, telling screen readers which items are warnings", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <EffectsToast
        report={{
          heading: "Plan revised",
          items: [
            { tone: "info", message: "Guests: 200 → 250" },
            { tone: "warning", message: "The plan is now ₹1,50,000 over budget." },
          ],
        }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("heading", { name: "Plan revised" })).toBeInTheDocument();
    expect(screen.getByText("Guests: 200 → 250")).toHaveTextContent(/^Guests: 200 → 250$/);
    expect(screen.getByText("The plan is now ₹1,50,000 over budget.")).toHaveTextContent(/^Warning: The plan/);
    expect(await axeViolations(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("says so when nothing else needed to move", () => {
    render(<EffectsToast report={{ heading: "Schedule updated", items: [] }} onDismiss={vi.fn()} />);
    expect(screen.getByText("Nothing else needed to move.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers undo when the change can still be undone, and shows a summary in place of the list", async () => {
    const onUndo = vi.fn();
    render(
      <EffectsToast
        report={{ heading: "Undone: Plan revised", items: [], summary: "Your plan is back to how it was." }}
        onDismiss={vi.fn()}
        onUndo={onUndo}
      />,
    );
    expect(screen.getByText("Your plan is back to how it was.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
