import { readFile } from "node:fs/promises";
import { createPlan, expect, test, TITLE, watchForErrors } from "./fixtures";

test("builds a plan, revises it in plain words, and undoes a trade-off", async ({ page }) => {
  await createPlan(page);
  const meta = page.locator(".overview .meta");
  await expect(meta).toContainText("200 guests");

  await page.getByLabel("What changed").fill("We now have 50 more guests");
  await page.getByRole("button", { name: "Preview the changes" }).click();
  await expect(page.getByText("Guests: 200 → 250")).toBeVisible();
  await page.getByRole("button", { name: "Apply to my plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan revised" })).toBeVisible();
  await expect(meta).toContainText("250 guests");
  const overBudget = page.getByText(/^The plan is ₹[\d,]+ over budget\./);
  await expect(overBudget).toBeVisible();

  // Giving something up closes the gap; undo puts the plan back as it was.
  await page.getByRole("link", { name: "Choose a trade-off" }).click();
  const option = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Choose this", disabled: false }) })
    .first();
  const choice = await option.getByRole("heading").innerText();
  await option.getByRole("button", { name: "Choose this" }).click();
  await expect(page.getByRole("heading", { name: `Applied: ${choice}`, exact: true })).toBeVisible();
  await expect(overBudget).toBeHidden();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: `Undone: Applied: ${choice}`, exact: true })).toBeVisible();
  await expect(overBudget).toBeVisible();

  // The plan is kept in this browser.
  await page.reload();
  await expect(meta).toContainText("250 guests");
  await expect(overBudget).toBeVisible();
});

test("drafts a run sheet for the day and copies it as text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createPlan(page);

  await page.getByRole("button", { name: "Draft a run sheet" }).click();
  const sheet = page.getByRole("table", { name: `Run sheet for ${TITLE}` });
  await expect(sheet.getByRole("row", { name: /Guests arrive/ })).toContainText("18:00");

  await page.getByRole("button", { name: "Copy as text" }).click();
  await expect(page.getByText(/^Copied\./)).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(new RegExp(`^${TITLE}: run sheet\\n\\d\\d:\\d\\d  `));
});

test("shares a copy by link, without the guest list", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createPlan(page);
  await page.getByLabel("Invitation (household or group)").fill("Meena's family");
  await page.getByRole("button", { name: "Add invitation" }).click();
  await expect(page.getByText("1 invitation for 2 people")).toBeVisible();

  await page.getByRole("button", { name: "Copy share link" }).click();
  await expect(page.getByText(/^Link copied\./)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/#plan=[\w-]+$/);

  // A friend opens it in a browser that has no plan yet.
  const theirs = await browser.newContext();
  const friend = await theirs.newPage();
  const errors = await watchForErrors(friend);
  await friend.goto(link);
  await expect(friend.getByText(`A plan was shared with you: ${TITLE}.`)).toBeVisible();
  await friend.getByRole("button", { name: "Open the shared plan" }).click();
  await expect(friend.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(friend.getByText(/^No invitations yet\./)).toBeVisible();
  expect(new URL(friend.url()).hash).toBe("");
  expect(errors).toEqual([]);
  await theirs.close();
});

test("downloads the plan and its dates, and opens the plan file on another device", async ({ page, browser }, info) => {
  await createPlan(page);

  const calendarDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add dates to calendar" }).click();
  const calendar = await calendarDownload;
  expect(calendar.suggestedFilename()).toBe("anu-ravi-s-wedding-dates.ics");
  expect(await readFile(await calendar.path(), "utf8")).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*\r\nEND:VCALENDAR\r\n$/);

  const planDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download plan" }).click();
  const download = await planDownload;
  expect(download.suggestedFilename()).toBe("anu-ravi-s-wedding.json");
  const file = info.outputPath("plan.json");
  await download.saveAs(file);

  const elsewhere = await browser.newContext();
  const device = await elsewhere.newPage();
  const errors = await watchForErrors(device);
  await device.goto("/");
  await device.getByLabel("Open a plan file you downloaded").setInputFiles(file);
  await expect(device.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  expect(errors).toEqual([]);
  await elsewhere.close();
});

test("asks before starting over, and keeps focus with the question until it is answered", async ({ page }) => {
  await createPlan(page);
  const newPlan = page.getByRole("button", { name: "New plan" });
  const dialog = page.getByRole("alertdialog", { name: "Start a new plan?" });

  // The safe answer has focus.
  await newPlan.click();
  await expect(dialog.getByRole("button", { name: "Keep this plan" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Start a new plan" })).toBeFocused();
  // The page behind can't be clicked while the question is open.
  await expect(newPlan.click({ trial: true, timeout: 500 })).rejects.toThrow();

  // Escape keeps the plan and puts focus back on the button that asked.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(newPlan).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();

  await newPlan.click();
  await dialog.getByRole("button", { name: "Start a new plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /survives real life/ })).toBeVisible();
});
