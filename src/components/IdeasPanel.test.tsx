import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Idea } from "@/lib/ai/contracts";
import { totalIdeaCost } from "@/lib/ai/idea-cost";
import type { Plan } from "@/lib/domain/schema";
import { axeViolations } from "@/test/axe";
import { stubFetch } from "@/test/fetch";
import { weddingPlan } from "@/test/plan";
import { IdeasPanel } from "./IdeasPanel";

function idea(
  title: string,
  category: Idea["category"],
  costBreakdown: Idea["costBreakdown"],
  extra: Partial<Idea> = {},
): Idea {
  return totalIdeaCost({
    title,
    summary: `${title} summary`,
    whyItFits: `${title} fits`,
    details: [],
    category,
    assumptions: [],
    costBreakdown,
    ...extra,
  });
}

const IDEAS = [
  idea(
    "Marigold courtyard",
    "decor",
    [
      { item: "Flowers", min: 40_000, max: 60_000 },
      { item: "Lights", min: 10_000, max: 10_000 },
    ],
    {
      details: ["Marigold torans"],
      assumptions: ["Fresh flowers"],
    },
  ),
  idea("Grand thali", "catering", [{ item: "Food", min: 300_000, max: 340_000 }]),
  idea("Two photographers", "photography", [{ item: "Coverage", min: 60_000, max: 100_000 }]),
];

const reply = (ideas: Idea[], followUpQuestion: string | null = null) => ({
  source: "ai",
  data: { ideas, followUpQuestion },
});

function setup(plan: Plan = weddingPlan()) {
  const user = userEvent.setup();
  return { ...render(<IdeasPanel plan={plan} />), user, plan };
}

const card = (title: string) => within(screen.getByRole("heading", { name: title }).closest("li")!);

describe("IdeasPanel", () => {
  it("suggests ideas, each sized against the user's own budget line", async () => {
    const api = stubFetch();
    api.reply(reply(IDEAS));
    const { container, user, plan } = setup();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));

    expect(await screen.findByText("Fits your decor budget of ₹96,000")).toBeInTheDocument();
    expect(card("Grand thali").getByText("₹44,000+ over your catering budget")).toHaveClass("warn-text");
    expect(card("Two photographers").getByText("May stretch your photography budget of ₹80,000")).toHaveClass(
      "warn-text",
    );
    expect(card("Marigold courtyard").getByText("Estimate").closest("p")).toHaveTextContent(
      /^Estimate ₹50,000–₹70,000$/,
    );
    expect(card("Marigold courtyard").getByText("Marigold torans")).toBeInTheDocument();
    const detailLists = (title: string) =>
      screen.getByRole("heading", { name: title }).closest("li")!.querySelectorAll(":scope > ul");
    expect(detailLists("Marigold courtyard")).toHaveLength(1);
    expect(detailLists("Grand thali")).toHaveLength(0);
    expect(screen.getByText("AI suggestion")).toBeInTheDocument();
    expect(api.sent()[0]!).toEqual({ url: "/api/ideas", body: { brief: plan.brief, budget: plan.budget } });
    expect(screen.getByRole("button", { name: "Start over with fresh ideas" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("shows how each estimate adds up and what it assumes", async () => {
    stubFetch().reply(reply(IDEAS));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    await screen.findByText("Fits your decor budget of ₹96,000");

    const marigold = card("Marigold courtyard");
    await user.click(marigold.getByText("How this adds up"));
    expect(marigold.getByText("Flowers: ₹40,000–₹60,000")).toBeInTheDocument();
    expect(marigold.getByText("Lights: ₹10,000")).toBeInTheDocument();
    expect(marigold.getByText("Fresh flowers")).toBeInTheDocument();
    expect(card("Grand thali").queryByText("Based on:")).not.toBeInTheDocument();
  });

  it("says when the budget has no line for an idea", async () => {
    stubFetch().reply(reply([idea("Matching outfits", "attire", [{ item: "Outfits", min: 5_000, max: 9_000 }])]));
    const { user } = setup(weddingPlan({ eventType: "community" }));
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    expect(await screen.findByText("No attire line in your budget yet")).toHaveClass("warn-text");
  });

  it("reworks the ideas from the user's feedback, then clears the box", async () => {
    const api = stubFetch();
    api.reply(reply(IDEAS, "Will there be children?"));
    const { user, plan } = setup();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    const box = await screen.findByLabelText("What would you change?");
    expect(box).toHaveAccessibleDescription("Will there be children?");
    expect(screen.getByRole("button", { name: "Rework the ideas" })).toBeDisabled();

    const release = api.pending();
    await user.type(box, "Too expensive");
    await user.click(screen.getByRole("button", { name: "Rework the ideas" }));
    expect(screen.getByRole("button", { name: "Reworking…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thinking…" })).toBeDisabled();
    release(reply([IDEAS[0]!]));
    expect(await screen.findByRole("button", { name: "Rework the ideas" })).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(api.sent()[1]!.body).toEqual({
      brief: plan.brief,
      budget: plan.budget,
      refinement: "Too expensive",
      previous: IDEAS,
    });
    expect(screen.queryByRole("heading", { name: "Grand thali" })).not.toBeInTheDocument();
  });

  // Regression: a failed rework used to wipe the ideas and the feedback box.
  it("keeps the ideas and the feedback when a rework fails", async () => {
    const api = stubFetch();
    api.reply(reply(IDEAS));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    api.reply({ error: "Too many requests. Wait a moment and try again." }, 429);
    await user.type(await screen.findByLabelText("What would you change?"), "Too expensive");
    await user.click(screen.getByRole("button", { name: "Rework the ideas" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.getByRole("heading", { name: "Grand thali" })).toBeInTheDocument();
    expect(screen.getByLabelText("What would you change?")).toHaveValue("Too expensive");
  });

  it("reports a failed first request", async () => {
    stubFetch().offline();
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server.");
    expect(screen.queryByLabelText("What would you change?")).not.toBeInTheDocument();
  });
});
