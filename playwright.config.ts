import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Browser tests against the production build, served the way the container
 * serves it. `npm run test:e2e` builds first.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/serve.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // Blank rather than unset, so keys in .env.local aren't loaded either:
      // the tests use the built-in suggestions, which are deterministic and free.
      AI_PROVIDER: "",
      GEMINI_API_KEY: "",
      GROQ_API_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
  },
});
