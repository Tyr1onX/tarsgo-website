import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactRoot = path.join(__dirname, ".artifacts", "playwright");

export default defineConfig({
  testDir: path.join(__dirname, "tests", "e2e"),
  outputDir: path.join(artifactRoot, "test-results"),
  snapshotDir: path.join(artifactRoot, "snapshots"),
  reporter: [["list"], ["html", { outputFolder: path.join(artifactRoot, "html-report") }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
