import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  outputDir: "test-results/playwright",
  use: {
    baseURL: "http://127.0.0.1:4318",
    browserName: "chromium",
    colorScheme: "dark",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium-wide",
      use: { viewport: { width: 1440, height: 900 } }
    },
    {
      name: "chromium-mobile-390",
      use: { viewport: { width: 390, height: 844 } }
    }
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4318",
    env: { PORT: "4318" },
    reuseExistingServer: false,
    timeout: 15_000
  }
});
