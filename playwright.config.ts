import { defineConfig } from '@playwright/test'

// End-to-end tests that launch the REAL TreeMonk Electron app and click through
// it. Kept separate from the Vitest unit tests (which live under src/**). Run
// `npm run build` first (the e2e npm scripts do this for you) so out/main exists.
export default defineConfig({
  testDir: './e2e',
  // Launching Electron + first paint is slower than a browser, so be generous.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    // A screenshot + trace on failure so you can see exactly where a click went
    // wrong (open with `npx playwright show-trace`).
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  }
})
