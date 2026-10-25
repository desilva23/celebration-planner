import axe from "axe-core";

/**
 * Structural accessibility checks (names, roles, ARIA, labels) for a rendered
 * component. Colour contrast needs real layout, and landmark rules only make
 * sense for a whole page, so both are left to the browser.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const { violations } = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}
