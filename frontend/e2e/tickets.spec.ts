import { expect, test, type Page } from "@playwright/test";

import { login, THEME_KEY, trackErrors } from "./helpers";

const WIDTHS = [375, 768, 1024, 1440];
const THEMES = ["light", "dark"] as const;

async function setup(page: Page, width: number, theme: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [THEME_KEY, theme]);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
}

const results = (page: Page) => page.getByText(/^Showing \d+–\d+ of \d+ tickets?$/);

test.describe("rendering", () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`tickets list and detail at ${width}px in ${theme} mode`, async ({ page }) => {
        await setup(page, width, theme);
        const errors = trackErrors(page);
        await login(page);

        await page.goto("/tickets");
        await expect(page.getByRole("heading", { level: 1, name: "Tickets" })).toBeVisible();
        await expect(results(page)).toBeVisible();
        // Cards below 1024px, table from 1024px.
        if (width < 1024) await expect(page.getByRole("table")).toBeHidden();
        else await expect(page.getByRole("table")).toBeVisible();
        await noOverflow(page);
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `e2e-artifacts/tickets-${width}-${theme}.png`, fullPage: true });

        await page.locator("a[href^='/tickets/']:not([href='/tickets/new'])").filter({ visible: true }).first().click();
        await expect(page.getByRole("heading", { name: "Ticket details" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "AI assistance" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await noOverflow(page);
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `e2e-artifacts/ticket-detail-${width}-${theme}.png`, fullPage: true });
        expect(errors, "console errors").toEqual([]);
      });
    }
  }
});

test.describe("workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
  });

  test("search, filters and sort update results and the URL", async ({ page }) => {
    await page.goto("/tickets");
    await expect(results(page)).toBeVisible();
    const all = Number((await results(page).textContent())!.match(/of (\d+)/)![1]);

    // Search matches subject, description or ID; searching a ticket number from the list returns exactly that ticket.
    const rows = page.getByRole("table").locator("tbody tr");
    const number = (await rows.nth(3).locator("td").first().textContent())!.trim();
    await page.getByLabel("Search tickets").fill(number);
    await expect(page).toHaveURL(new RegExp(`q=${number}`));
    await expect(results(page)).toHaveText("Showing 1–1 of 1 ticket");
    await expect(rows.first()).toContainText(number);

    await page.getByRole("button", { name: /Remove filter/ }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(results(page)).toHaveText(new RegExp(`of ${all} tickets`));

    await page.getByLabel("Status", { exact: true }).selectOption("pending");
    await expect(page).toHaveURL(/status=pending/);
    for (const text of await rows.allTextContents()) expect(text).toContain("Pending");

    // A filtered URL restores the same view.
    await page.reload();
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue("pending");
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    // Most urgent first: the first row is critical.
    await page.getByLabel("Sort", { exact: true }).selectOption("priority:true");
    await expect(page).toHaveURL(/sort=priority/);
    await expect(rows.first()).toContainText("Critical");
    await page.getByLabel("Sort", { exact: true }).selectOption("priority:false");
    await expect(rows.first()).toContainText("Low");
  });

  test("create a ticket, edit it, add a note, resolve with confirmation", async ({ page }) => {
    const subject = `E2E test ticket ${Date.now()}`;
    await page.goto("/tickets/new");
    const form = page.getByRole("form", { name: "New ticket" });
    await form.getByLabel("Subject").fill(subject);
    await form.getByLabel("Description").fill("Synthetic ticket created by the Playwright suite.");
    await form.getByRole("button", { name: "Create ticket" }).click();

    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    const status = page.getByLabel("Status", { exact: true });
    await expect(status).toHaveValue("new");

    // Field edit: toast plus a history entry.
    const assignee = page.getByLabel("Assignee");
    const firstPerson = await assignee.locator("option").nth(1).textContent();
    await assignee.selectOption({ index: 1 });
    await expect(page.getByRole("status").getByText("Assignee saved")).toBeVisible();
    await expect(page.locator("#act").locator("xpath=ancestor::section[1]")).toContainText(firstPerson!);

    // Note.
    await page.getByLabel("Add a note").fill("Checked the cable; still failing.");
    await page.getByRole("button", { name: "Add note" }).click();
    const activity = page.getByRole("region", { name: "Activity" });
    await expect(activity.getByRole("listitem").filter({ hasText: "Checked the cable; still failing." })).toBeVisible();
    await expect(page.getByLabel("Add a note")).toHaveValue("");

    // Resolving without a summary asks first; cancelling changes nothing.
    await status.selectOption("resolved");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(status).toHaveValue("new");

    await status.selectOption("resolved");
    await page.getByRole("dialog").getByRole("button", { name: "Mark Resolved" }).click();
    await expect(status).toHaveValue("resolved");
    await expect(page.getByRole("status").getByText("Status saved")).toBeVisible();

    // AI suggestions sit in their own labelled region, apart from the approved fields.
    const ai = page.getByRole("complementary", { name: "AI assistance" });
    await expect(ai).toBeVisible();
    await expect(ai.getByLabel("Status")).toHaveCount(0);
  });

  test("a note and a field change sent together both stick", async ({ page }) => {
    await page.goto("/tickets/new");
    const form = page.getByRole("form", { name: "New ticket" });
    await form.getByLabel("Subject").fill(`E2E race ticket ${Date.now()}`);
    await form.getByLabel("Description").fill("Synthetic ticket for the concurrent-update check.");
    await form.getByRole("button", { name: "Create ticket" }).click();
    const priority = page.getByLabel("Priority", { exact: true });
    await expect(priority).toHaveValue("medium");

    await page.getByLabel("Add a note").fill("Race note");
    await page.getByRole("button", { name: "Add note" }).click();
    await priority.selectOption("critical"); // no wait in between, on purpose
    await expect(page.getByRole("region", { name: "Activity" }).getByRole("listitem").filter({ hasText: "Race note" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(priority).toHaveValue("critical");
    await page.reload();
    await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("critical");
  });

  test("unknown ticket shows a not-found state", async ({ page }) => {
    await page.goto("/tickets/999999");
    await expect(page.getByText("Ticket not found")).toBeVisible();
  });
});
