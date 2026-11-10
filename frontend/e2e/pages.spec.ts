import { expect, test, type Page } from "@playwright/test";

import { login, THEME_KEY, trackErrors } from "./helpers";

const WIDTHS = [375, 768, 1024, 1440];
const THEMES = ["light", "dark"] as const;

async function setup(page: Page, width: number, theme: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [THEME_KEY, theme]);
}
async function checkPage(page: Page, name: string, width: number, theme: string) {
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name}: horizontal overflow in px`).toBeLessThanOrEqual(0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `e2e-artifacts/${name}-${width}-${theme}.png`, fullPage: true });
}

test.describe("rendering", () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`knowledge, analytics and evaluation at ${width}px in ${theme} mode`, async ({ page }) => {
        await setup(page, width, theme);
        const errors = trackErrors(page);
        await login(page);

        await page.goto("/knowledge");
        await expect(page.getByRole("heading", { level: 1, name: "Knowledge base" })).toBeVisible();
        await expect(page.getByText(/^\d+ articles?$/)).toBeVisible();
        await checkPage(page, "knowledge", width, theme);

        await page.locator("main a[href^='/knowledge/']:not([href='/knowledge/new'])").first().click();
        await expect(page.getByRole("heading", { name: /Troubleshooting steps \(\d+\)/ })).toBeVisible();
        await checkPage(page, "article", width, theme);

        await page.goto("/analytics");
        await expect(page.getByRole("heading", { name: "Possible incidents" })).toBeVisible();
        await expect(page.getByRole("table", { name: /Tickets created per week/ })).toBeVisible();
        await checkPage(page, "analytics", width, theme);

        await page.goto("/evaluation");
        await expect(page.getByRole("heading", { name: "Category classifier" })).toBeVisible();
        await expect(page.getByRole("note").filter({ hasText: "synthetic data" })).toBeVisible();
        await checkPage(page, "evaluation", width, theme);
        expect(errors, "console errors").toEqual([]);
      });
    }
  }
});

test.describe("knowledge workflows", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("ranked search shows match labels; browse mode filters by status", async ({ page }) => {
    await login(page);
    await page.goto("/knowledge");
    await page.getByLabel("Search articles").fill("printer says paper jam");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const results = page.locator("main ol > li");
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText(/Strong match|Weak match|Relevance not validated/);
    await expect(results.first()).toContainText(/printer/i);

    await page.getByRole("radio", { name: "Browse and filter" }).click();
    await page.getByLabel("Status").selectOption("approved");
    await expect(page.getByText(/^\d+ articles?$/)).toBeVisible();
    for (const card of await page.locator("main ul.grid > li").all()) await expect(card).toContainText("Approved");
  });

  test("a technician's new article is saved as a draft and can be edited", async ({ page }) => {
    await login(page);
    const title = `E2E article ${Date.now()}`;
    await page.goto("/knowledge/new");
    const form = page.getByRole("form", { name: "Article" });
    await expect(form.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Problem description").fill("Synthetic problem written by the Playwright suite.");
    await form.getByLabel("Troubleshooting steps").fill("Restart the device\nCheck the cable");
    await expect(form.getByText("2 steps")).toBeVisible();
    await form.getByLabel("Source note").fill("Synthetic test content");
    await form.getByRole("button", { name: "Save draft" }).click();

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "a draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve for suggestions" })).toHaveCount(0); // technicians cannot approve

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Troubleshooting steps").fill("Restart the device\nCheck the cable\nTry another port");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").getByText("Article saved")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Troubleshooting steps (3)" })).toBeVisible();
  });

  test("an administrator approves and archives with confirmation", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASSWORD, "Needs SEED_ADMIN_PASSWORD in .env");
    await login(page, "admin");
    const title = `E2E admin article ${Date.now()}`;
    await page.goto("/knowledge/new");
    const form = page.getByRole("form", { name: "Article" });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Problem description").fill("Synthetic problem for the approval flow.");
    await form.getByLabel("Troubleshooting steps").fill("Step one");
    await form.getByLabel("Source note").fill("Synthetic test content");
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    await page.getByRole("button", { name: "Approve for suggestions" }).click();
    await expect(page.getByRole("status").getByText("Article approved")).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "not used for AI suggestions" })).toHaveCount(0);

    await page.getByRole("button", { name: "Archive" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Return to draft" })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("status").getByText("Article archived")).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "archived" })).toBeVisible();
  });
});

test.describe("analytics and evaluation", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await login(page); });

  test("sidebar Incident Patterns lands on possible incidents; heatmap has a row per category", async ({ page }) => {
    await page.getByRole("link", { name: "Incident Patterns" }).click();
    await expect(page).toHaveURL(/\/analytics#inc$/);
    await expect(page.locator("#inc")).toBeInViewport();
    const heat = page.getByRole("table", { name: /Tickets created per week/ });
    const rows = await heat.locator("tbody th[scope=row]").allTextContents();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.at(-1)).toBe("Total");
    // Window change re-fetches with the new number of weeks.
    const req = page.waitForRequest((r) => r.url().includes("/api/analytics/insights?weeks=26"));
    await page.getByLabel("Volume window").selectOption("26");
    await req;
    await expect(heat.locator("thead th")).toHaveCount(27);
  });

  test("evaluation page shows the classifier, retrieval and assistant sections with section links", async ({ page }) => {
    await page.goto("/evaluation");
    for (const name of ["Live review", "Category classifier", "Retrieval", "Troubleshooting", "Incident bursts"]) {
      await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name })).toBeVisible();
    }
    await expect(page.getByText("Test accuracy (deployed)")).toBeVisible();
    await expect(page.getByRole("table", { name: /Confusion matrix/ })).toBeVisible();
    await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Retrieval" }).click();
    await expect(page.locator("#retr")).toBeInViewport();
  });
});
