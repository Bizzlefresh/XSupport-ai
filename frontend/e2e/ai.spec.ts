import { expect, test, type Page } from "@playwright/test";

import { login, THEME_KEY, trackErrors } from "./helpers";

async function createTicket(page: Page, subject: string, description: string) {
  await page.goto("/tickets/new");
  const form = page.getByRole("form", { name: "New ticket" });
  await form.getByLabel("Subject").fill(subject);
  await form.getByLabel("Description").fill(description);
  await form.getByRole("button", { name: "Create ticket" }).click();
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
}

const panel = (page: Page, name: string) => page.getByRole("region", { name });
const approvedCategory = (page: Page) => page.getByRole("region", { name: "Ticket details" }).getByLabel("Category", { exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
});

test("category suggestion stays separate until accepted", async ({ page }) => {
  const errors = trackErrors(page);
  await createTicket(page, `E2E AI projector ${Date.now()}`,
    "The projector in lecture room 204 shows no signal when I connect my laptop with the HDMI cable.");
  const cat = panel(page, "Category suggestion");
  await expect(approvedCategory(page)).toHaveValue("");

  await cat.getByRole("button", { name: "Suggest category" }).click();
  await expect(cat.getByText("AI suggestion")).toBeVisible();
  await expect(cat.getByRole("meter")).toBeVisible();
  const suggested = (await cat.locator("p.text-base").textContent())!.trim();
  // A suggestion alone never changes the approved category.
  await expect(approvedCategory(page)).toHaveValue("");
  await expect(cat.getByText("Approved now:")).toBeVisible();

  await cat.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("status").getByText(`Category set to ${suggested}`)).toBeVisible();
  await expect(approvedCategory(page).locator("option:checked")).toHaveText(suggested);
  await expect(cat.getByText("Accepted")).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity" })).toContainText("AI category suggestion");
  expect(errors).toEqual([]);
});

test("editing a suggestion applies the technician's category; rejecting changes nothing", async ({ page }) => {
  await createTicket(page, `E2E AI password ${Date.now()}`, "I forgot my password and my account is locked after several attempts.");
  const cat = panel(page, "Category suggestion");
  await cat.getByRole("button", { name: "Suggest category" }).click();
  await expect(cat.getByRole("meter")).toBeVisible();

  const choose = cat.getByLabel("Or choose the right category");
  await choose.selectOption({ index: 1 });
  const chosen = (await choose.locator("option:checked").textContent())!.trim();
  await cat.getByRole("button", { name: "Apply" }).click();
  await expect(approvedCategory(page).locator("option:checked")).toHaveText(chosen);
  await expect(cat.getByText("Changed to a different category")).toBeVisible();

  // A fresh suggestion, rejected: the approved category stays as the technician set it.
  await cat.getByRole("button", { name: "New suggestion" }).click();
  await expect(cat.getByRole("button", { name: "Reject" })).toBeVisible();
  await cat.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("status").getByText("Suggestion rejected")).toBeVisible();
  await expect(approvedCategory(page).locator("option:checked")).toHaveText(chosen);
  await expect(cat.getByText("Earlier suggestions (1)")).toBeVisible();
});

test("troubleshooting steps cite sources, can be added as a note, and can be rated", async ({ page }) => {
  // Printer wording matches the approved "Printer offline, jammed or showing an error" article in the sample knowledge base.
  await createTicket(page, `E2E AI printer ${Date.now()}`, "Printer on floor 3 says paper jam but there is no paper stuck inside.");
  const ts = panel(page, "Troubleshooting steps");
  await ts.getByRole("button", { name: "Suggest troubleshooting" }).click();
  await expect(ts.getByText("Matched to approved articles")).toBeVisible();

  const source = (await ts.locator("article a").first().textContent())!.trim();
  await expect(ts.locator("article ol li").first()).toBeVisible();
  await ts.getByRole("button", { name: "Add these steps as a ticket note" }).first().click();
  await expect(ts.getByRole("button", { name: "Added as a note" }).first()).toBeDisabled();
  await expect(page.getByRole("region", { name: "Activity" })).toContainText(`Suggested steps from "${source}"`);

  await ts.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(ts.getByText("You rated this:")).toContainText("Helpful");
});

test("related articles and similar tickets load and re-rank", async ({ page }) => {
  await createTicket(page, `E2E AI vpn ${Date.now()}`, "The VPN client will not connect from home and shows an authentication error.");
  const art = panel(page, "Related articles");
  const sim = panel(page, "Similar past tickets");
  await expect(art.getByRole("listitem").first()).toBeVisible();
  await expect(sim.getByRole("listitem").first()).toBeVisible();

  const req = page.waitForRequest((r) => r.url().endsWith("/api/ai/related-articles") && r.postDataJSON()?.method === "lexical");
  await art.getByLabel("Ranking").selectOption("lexical");
  await req;
  await expect(art.getByRole("listitem").first()).toBeVisible();
});

test("dashboard AI review queue shows a pending suggestion", async ({ page }) => {
  await createTicket(page, `E2E AI queue ${Date.now()}`, "Outlook will not sync my calendar on my phone since yesterday.");
  await panel(page, "Category suggestion").getByRole("button", { name: "Suggest category" }).click();
  await expect(panel(page, "Category suggestion").getByRole("meter")).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [THEME_KEY, theme]);
    await page.goto("/dashboard");
    const queue = page.getByRole("region", { name: "AI review queue" });
    await expect(queue.getByText("Awaiting technician review")).toBeVisible();
    await expect(queue.locator("p.text-3xl")).not.toHaveText("0");
    await page.waitForLoadState("networkidle");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `e2e-artifacts/dashboard-ai-queue-1440-${theme}.png`, fullPage: true });
  }
});

for (const width of [375, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`AI panels with results render at ${width}px in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [THEME_KEY, theme]);
      const errors = trackErrors(page);
      await createTicket(page, `E2E AI render ${Date.now()}`, "Printer on floor 3 says paper jam but there is no paper stuck inside.");
      await panel(page, "Category suggestion").getByRole("button", { name: "Suggest category" }).click();
      await expect(panel(page, "Category suggestion").getByRole("meter")).toBeVisible();
      await panel(page, "Troubleshooting steps").getByRole("button", { name: "Suggest troubleshooting" }).click();
      await expect(panel(page, "Troubleshooting steps").getByRole("status").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.locator("#ai-assistance").screenshot({ path: `e2e-artifacts/ai-panels-${width}-${theme}.png` });
      expect(errors).toEqual([]);
    });
  }
}
