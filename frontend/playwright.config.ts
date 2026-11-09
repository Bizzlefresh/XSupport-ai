import { defineConfig } from "@playwright/test";

// End-to-end tests run against a running stack (docker compose up + seeded synthetic data).
// Credentials come from the environment (E2E_EMAIL / E2E_PASSWORD), never from the repo.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-artifacts/results",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
