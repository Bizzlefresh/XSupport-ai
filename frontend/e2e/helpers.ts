import { expect, type Page } from "@playwright/test";

export const THEME_KEY = "xsupport.theme";

export async function login(page: Page) {
  const email = process.env.E2E_EMAIL ?? "tech@xsupport.example.com";
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error("Set E2E_PASSWORD (the seeded technician password) to run e2e tests.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Collects console errors and failed page errors so a test can assert there were none. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
