import { expect, test } from "@playwright/test";

import { login, THEME_KEY, trackErrors } from "./helpers";

const WIDTHS = [375, 768, 1024, 1440];
const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`dashboard renders at ${width}px in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" }); // charts render fully, no mid-animation screenshots
      await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [THEME_KEY, theme]);
      const errors = trackErrors(page);
      await login(page);

      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

      // KPI values come from /analytics/overview; wait until the skeletons are replaced.
      const kpis = page.getByRole("region", { name: "Summary" }).locator(":scope > *");
      await expect(kpis).toHaveCount(6);
      await expect(page.getByRole("region", { name: "Summary" }).locator(".skeleton")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Recent tickets" })).toBeVisible();
      await expect(page.locator("#recent").locator("xpath=ancestor::section[1]").locator("a[href^='/tickets/']").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "AI review queue" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Possible recurring incidents" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
      await page.waitForLoadState("networkidle");

      // KPI cards that share a row must have the same height.
      const boxes = await kpis.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; }));
      const rows = new Map<number, number[]>();
      for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b.h]);
      for (const hs of rows.values()) expect(Math.max(...hs) - Math.min(...hs), `KPI heights in a row: ${hs}`).toBeLessThanOrEqual(1);

      // No horizontal page scroll.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

      await page.mouse.move(0, 0); // keep chart tooltips out of the screenshot
      await page.screenshot({ path: `e2e-artifacts/dashboard-${width}-${theme}.png`, fullPage: true });
      expect(errors, "console errors").toEqual([]);
    });
  }
}
