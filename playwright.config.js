import { defineConfig, devices } from "@playwright/test";

// Serves the static app and drives it in a mobile-ish Chromium. Camera is
// absent in CI, so tests exercise the manual-code path (the dedup logic is
// identical to a real scan).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:8000",
    locale: "en-US",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: "python3 -m http.server 8000",
    url: "http://localhost:8000",
    reuseExistingServer: true,
    timeout: 20000,
  },
});
