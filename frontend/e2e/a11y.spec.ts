import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { login, THEME_KEY } from "./helpers";

// Automated WCAG 2.1 A/AA checks with axe-core. Automated tools find only part of real accessibility problems;
// this catches regressions (contrast, names, roles, landmarks), it does not replace testing with assistive technology.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.mouse.move(0, 0);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${name}: serious/critical axe violations`).toEqual([]);
}

async function createTicket(page: Page) {
  await page.goto("/tickets/new");
  const form = page.getByRole("form", { name: "New ticket" });
  await form.getByLabel("Subject").fill(`E2E a11y ${Date.now()}`);
  await form.getByLabel("Description").fill("Printer on floor 3 says paper jam but there is no paper stuck inside.");
  await form.getByRole("button", { name: "Create ticket" }).click();
  await expect(page.getByRole("heading", { name: "Ticket details" })).toBeVisible();
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe in ${theme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [THEME_KEY, theme]);
    });

    test("login page", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await scan(page, "login");
    });

    test("workspace pages", async ({ page }) => {
      await login(page);
      for (const [path, heading] of [
        ["/dashboard", "Dashboard"], ["/tickets", "Tickets"], ["/tickets/new", "New ticket"], ["/knowledge", "Knowledge base"],
        ["/analytics", "Analytics"], ["/evaluation", "AI evaluation"], ["/settings", "Settings"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await scan(page, path);
      }
      await page.goto("/knowledge");
      await page.locator("main a[href^='/knowledge/']:not([href='/knowledge/new'])").first().click();
      await expect(page.getByRole("heading", { name: /Troubleshooting steps/ })).toBeVisible();
      await scan(page, "article");
    });

    test("ticket detail with AI results, dialog and menus", async ({ page }) => {
      await login(page);
      await createTicket(page);
      await page.getByRole("region", { name: "Category suggestion" }).getByRole("button", { name: "Suggest category" }).click();
      await expect(page.getByRole("meter")).toBeVisible();
      await page.getByRole("region", { name: "Troubleshooting steps" }).getByRole("button", { name: "Suggest troubleshooting" }).click();
      await expect(page.getByText("Matched to approved articles")).toBeVisible();
      await scan(page, "ticket detail");

      await page.getByLabel("Status", { exact: true }).selectOption("resolved");
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, "confirm dialog");
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

      await page.getByRole("button", { name: /account menu/i }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await scan(page, "account menu");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /account menu/i })).toBeFocused();

      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await page.keyboard.type("printer");
      await scan(page, "command palette");
    });
  });
}
