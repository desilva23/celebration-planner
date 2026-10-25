import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata, viewport } from "./layout";

describe("RootLayout", () => {
  it("declares the page language and starts with a skip link to the main content", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main id="main">Plan</main>
      </RootLayout>,
    );
    expect(html).toMatch(/^<html lang="en-IN">/);
    expect(html).toMatch(/<body><a href="#main" class="skip-link">Skip to content<\/a><main id="main">/);
  });

  it("describes the app and themes the browser chrome for light and dark", () => {
    expect(metadata.title).toBe("Celebration Planner");
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#fbf7f2" },
      { media: "(prefers-color-scheme: dark)", color: "#171412" },
    ]);
  });
});
