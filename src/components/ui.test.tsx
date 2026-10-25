import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@/test/axe";
import { categoryLabel, ErrorMessage, Provenance, Section, SourceBadge } from "./ui";

describe("categoryLabel", () => {
  it("labels budget categories and the planning pseudo-category", () => {
    expect(categoryLabel("catering")).toBe("Catering");
    expect(categoryLabel("planning")).toBe("Planning");
  });
});

describe("SourceBadge", () => {
  it("says in words whether a figure is confirmed or an estimate", () => {
    const { rerender } = render(<SourceBadge source="confirmed" />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    rerender(<SourceBadge source="estimate" />);
    expect(screen.getByText("Estimate")).toBeInTheDocument();
  });
});

describe("Provenance", () => {
  it("labels AI output and falls back to a generic caution", () => {
    render(<Provenance envelope={{ source: "ai", data: null }} />);
    expect(screen.getByText("AI suggestion")).toBeInTheDocument();
    expect(screen.getByText(/Check details with vendors/)).toBeInTheDocument();
  });

  it("labels built-in output and shows the server's notice", () => {
    render(<Provenance envelope={{ source: "fallback", data: null, notice: "AI isn't configured." }} />);
    expect(screen.getByText("Built-in suggestion")).toBeInTheDocument();
    expect(screen.getByText(/AI isn't configured\./)).toBeInTheDocument();
  });
});

describe("ErrorMessage", () => {
  it("is announced as an alert", () => {
    render(<ErrorMessage>Something broke</ErrorMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });
});

describe("Section", () => {
  it("is a region named by its heading, with an optional intro", async () => {
    const { container } = render(
      <Section id="budget" title="Budget" intro="Planning figures">
        <p>Body</p>
      </Section>,
    );
    expect(screen.getByRole("region", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByText("Planning figures")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("omits the intro when there isn't one", () => {
    const { container } = render(
      <Section id="timeline" title="Timeline">
        <p>Body</p>
      </Section>,
    );
    expect(container.querySelector(".hint")).toBeNull();
  });
});
