import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardSetAsidePlan, savePlan } from "@/lib/client/plan-store";
import { axeViolations } from "@/test/axe";
import { weddingPlan } from "@/test/plan";
import { ErrorScreen } from "./ErrorScreen";

const error = new RangeError("Invalid time value");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  discardSetAsidePlan();
});

describe("ErrorScreen", () => {
  it("explains that the plan is safe, and logs the error locally", async () => {
    const { container } = render(<ErrorScreen error={error} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/Your plan is still saved in this browser/)).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(console.error).toHaveBeenCalledWith(error);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("tries the page again", async () => {
    const reset = vi.fn();
    render(<ErrorScreen error={error} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("starts over with the saved plan kept aside rather than deleted", async () => {
    const plan = weddingPlan();
    savePlan(plan);
    const reset = vi.fn();
    render(<ErrorScreen error={error} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Start over and keep a copy of my plan" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(localStorage.getItem("celebration-planner:plan:v1")).toBeNull();
    expect(JSON.parse(localStorage.getItem("celebration-planner:set-aside-plan")!)).toEqual(plan);
  });
});
