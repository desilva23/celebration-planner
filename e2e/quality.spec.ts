import type { Locator, Page } from "@playwright/test";
import { axeViolations, createPlan, expect, setGuests, test } from "./fixtures";

/** Whether two elements overlap on screen. */
async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const [p, q] = [await a.boundingBox(), await b.boundingBox()];
  if (!p || !q) throw new Error("Both elements must be on screen");
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

/** Over budget, with a change report and a run sheet showing: the busiest the plan gets. */
async function busyPlan(page: Page) {
  await createPlan(page);
  await page.getByLabel("Invitation (household or group)").fill("Meena's family");
  await page.getByRole("button", { name: "Add invitation" }).click();
  await page.getByRole("button", { name: "Draft a run sheet" }).click();
  await expect(page.getByRole("table", { name: /^Run sheet for/ })).toBeVisible();
  // Last, so the report it shows stays up for the checks.
  await setGuests(page, 300);
}

test.describe("Content Security Policy", () => {
  test("every page gets a fresh nonce, and every script it serves carries it", async ({ page }) => {
    const nonces: string[] = [];
    for (let visit = 0; visit < 2; visit++) {
      const response = (await page.goto("/"))!;
      const policy = response.headers()["content-security-policy"] ?? "";
      expect(policy).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/);
      const nonce = /'nonce-([\w+/=]+)'/.exec(policy)![1]!;
      const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);
      nonces.push(nonce);
    }
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  test("markup injected into the page can't run script", async ({ page, pageErrors }) => {
    await page.goto("/");
    // The usual cross-site scripting payloads, as if untrusted text reached the page as HTML.
    // (Scripts the page itself creates are trusted under 'strict-dynamic', so they aren't a test.)
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = `<img src="data:," onerror="window.injected = 1"><iframe srcdoc="<script>parent.injected = 2</script>"></iframe>`;
      document.body.append(box);
    });
    await expect
      .poll(() => pageErrors.filter((e) => e.startsWith("CSP violation:")).sort())
      .toEqual(["CSP violation: script-src-attr blocked inline", "CSP violation: script-src-elem blocked inline"]);
    expect(await page.evaluate(() => "injected" in window)).toBe(false);
    // Those refusals are the errors this test expects the page to log.
    pageErrors.length = 0;
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`Accessibility in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the start screen, also with its errors showing", async ({ page }) => {
      await page.goto("/");
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Build my plan" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Please fix" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("a plan with everything showing", async ({ page }) => {
      await busyPlan(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test.describe("On a 320px-wide screen", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  /** Why the page scrolls sideways, if it does: its width, then the elements sticking out. */
  const overflow = (page: Page) =>
    page.evaluate(() => {
      const root = document.documentElement;
      if (root.scrollWidth <= root.clientWidth) return [];
      const sticksOut = [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > root.clientWidth)
        .slice(0, 5)
        .map((el) => el.outerHTML.slice(0, 80));
      return [`page is ${root.scrollWidth}px wide in ${root.clientWidth}px`, ...sticksOut];
    });

  test("a control reached by keyboard isn't hidden behind a change report", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // jump rather than glide, to measure
    await createPlan(page);
    await setGuests(page, 300);
    const report = page.locator(".toast");
    const button = page.getByRole("button", { name: "Add invitation" });
    // Scroll so the button sits at the bottom of the screen, where the report is.
    await button.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - window.innerHeight + 4));
    expect(await overlaps(button, report)).toBe(true);

    await page.getByLabel("People", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    expect(await overlaps(button, report)).toBe(false);
  });

  test("nothing scrolls sideways", async ({ page }) => {
    await page.goto("/");
    expect(await overflow(page)).toEqual([]);
    await busyPlan(page);
    expect(await overflow(page)).toEqual([]);
  });
});
