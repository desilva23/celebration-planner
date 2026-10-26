import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { planFromLink } from "@/lib/client/share";
import { axeViolations } from "@/test/axe";
import { captureDownloads } from "@/test/downloads";
import { weddingPlan } from "@/test/plan";
import { OpenPlanFile, PlanSharing } from "./PlanSharing";

const plan = () => weddingPlan({ title: "Anu & Ravi's wedding" });

describe("PlanSharing", () => {
  it("downloads the whole plan as a readable file named after it", async () => {
    const files = captureDownloads();
    const { container } = render(<PlanSharing plan={plan()} />);
    await userEvent.click(screen.getByRole("button", { name: "Download plan" }));
    expect(files[0]!.name).toBe("anu-ravi-s-wedding.json");
    expect(JSON.parse(await files[0]!.blob.text())).toEqual(plan());
    expect(await axeViolations(container)).toEqual([]);
  });

  it("downloads the plan's dates as a calendar file", async () => {
    const files = captureDownloads();
    render(<PlanSharing plan={plan()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add dates to calendar" }));
    expect(files[0]!.name).toBe("anu-ravi-s-wedding-dates.ics");
    expect(files[0]!.blob.type).toBe("text/calendar");
    expect(await files[0]!.blob.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
  });

  it("copies a link that opens a copy of the plan", async () => {
    const user = userEvent.setup();
    render(<PlanSharing plan={plan()} />);
    await user.click(screen.getByRole("button", { name: "Copy share link" }));
    expect(await screen.findByText(/^Link copied\./)).toBeInTheDocument();
    const link = await navigator.clipboard.readText();
    expect(link.startsWith(`${window.location.origin}/#plan=`)).toBe(true);
    expect(await planFromLink(link.slice(link.indexOf("#")))).toEqual(plan());
  });

  it("shows the link to copy by hand when the clipboard is refused", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    render(<PlanSharing plan={plan()} />);
    await user.click(screen.getByRole("button", { name: "Copy share link" }));
    const field = await screen.findByLabelText(/^Copy this link to share a copy of the plan/);
    expect((field as HTMLInputElement).value).toMatch(/#plan=/);
    expect(screen.queryByText(/^Link copied\./)).not.toBeInTheDocument();
    await user.click(field);
    expect((field as HTMLInputElement).selectionEnd).toBe((field as HTMLInputElement).value.length);
  });
});

describe("OpenPlanFile", () => {
  const file = (text: string) => new File([text], "plan.json", { type: "application/json" });

  it("opens a plan file downloaded earlier", async () => {
    const onOpen = vi.fn();
    render(<OpenPlanFile onOpen={onOpen} />);
    await userEvent.upload(screen.getByLabelText("Open a plan file you downloaded"), file(JSON.stringify(plan())));
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith(plan()));
  });

  it("explains when a file isn't a plan", async () => {
    const onOpen = vi.fn();
    render(<OpenPlanFile onOpen={onOpen} />);
    await userEvent.upload(screen.getByLabelText("Open a plan file you downloaded"), file("hello"));
    expect(await screen.findByRole("alert")).toHaveTextContent("That file isn’t a plan this app can open.");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does nothing when the choice is cancelled", async () => {
    const onOpen = vi.fn();
    render(<OpenPlanFile onOpen={onOpen} />);
    // Clearing the choice still fires a change event, with no files.
    fireEvent.change(screen.getByLabelText("Open a plan file you downloaded"), { target: { files: [] } });
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
