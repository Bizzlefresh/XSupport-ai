import { defineConfig } from "@playwright/test";

// End-to-end tests run against a running stack (docker compose up + seeded synthetic data).
// Credentials come from the environment (E2E_EMAIL / E2E_PASSWORD), never from the repo.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-artifacts/results",
  timeout: 60_000,
  retries: 0,
  // One worker and a 10 s assertion timeout: the suite runs inside Docker Desktop's VM (4 CPUs here) alongside two
  // full stacks, and two parallel Chromium workers starved the backend into multi-second responses. Each request is
  // fast on its own (classify ~0.1 s, retrieval index rebuild ~0.3 s), so this is test-host load, not app latency.
  workers: 1,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
