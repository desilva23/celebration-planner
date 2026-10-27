import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test/axe";
import { ConfirmButton } from "./ConfirmButton";

function renderButton(onConfirm = vi.fn()) {
  return render(
    <ConfirmButton
      label="New plan"
      className="button ghost"
      question="Start a new plan?"
      detail="This removes the current plan from this browser."
      confirmLabel="Start a new plan"
      cancelLabel="Keep this plan"
      onConfirm={onConfirm}
    />,
  );
}

describe("ConfirmButton", () => {
  it("asks nothing until it is pressed", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "New plan" })).toHaveClass("button", "ghost");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks a named, described question with the safe choice first", async () => {
    const user = userEvent.setup();
    const { container } = renderButton();
    await user.click(screen.getByRole("button", { name: "New plan" }));

    const dialog = screen.getByRole("alertdialog", { name: "Start a new plan?" });
    expect(dialog).toHaveAccessibleDescription("This removes the current plan from this browser.");
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Keep this plan", "Start a new plan"]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("does nothing when the answer is no", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderButton(onConfirm);
    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(screen.getByRole("button", { name: "Keep this plan" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes, then acts, when the answer is yes", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    renderButton(onConfirm);
    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(screen.getByRole("button", { name: "Start a new plan" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
