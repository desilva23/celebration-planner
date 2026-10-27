import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/** Collects console errors, uncaught exceptions and Content Security Policy violations. */
export async function watchForErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // Reported from inside the page too, so a blocked script or style is caught
  // however the browser chooses to log it.
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP violation: ${event.effectiveDirective} blocked ${event.blockedURI}`);
    });
  });
  return errors;
}

/** Every test fails if its page logged an error. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors = await watchForErrors(page);
      await use(errors);
      expect(errors, "errors logged by the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const TITLE = "Anu & Ravi's wedding";

/** A date comfortably after today, as a date input takes it. */
function futureDate(): string {
  return new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
}

/** Fills in the start screen and builds a plan. */
export async function createPlan(page: Page) {
  await page.goto("/");
  await page.getByLabel("Name for this plan").fill(TITLE);
  await page.getByLabel("Event date").fill(futureDate());
  await page.getByLabel("Expected guests").fill("200");
  await page.getByLabel("Total budget (₹)").fill("800000");
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
}

/** Uses the direct edit form, which needs no AI call, to change the headcount. */
export async function setGuests(page: Page, guests: number) {
  await page.getByText("Or edit the details directly").click();
  await page.getByRole("spinbutton", { name: "Guests", exact: true }).fill(String(guests));
  await page.getByRole("button", { name: "Update the plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan revised" })).toBeVisible();
}

/** Every axe rule, including colour contrast and page landmarks, which jsdom can't check. */
export async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}
