import { defineConfig, devices } from '@playwright/test';

/**
 * ParkWatch end-to-end suite (paper Ch. IV, p.160–165).
 *
 * Verifies the 6 Specific Objectives (SO1–SO6) plus auth, portal, and security
 * spot checks. Exit criteria: all cases PASS, no critical/high defects.
 *
 * Test environment (paper): Google Chrome 120+ on desktop AND mobile form
 * factors — modelled here by the "Desktop Chrome" and "Mobile Chrome" projects.
 *
 * PREREQUISITES:
 *   1. Backend running at http://localhost:3000 (npm run dev in /backend).
 *      The webServer block below only starts the Vite frontend — the API is a
 *      separate process and must be up with the seeded test accounts
 *      (admin/barangay/officer/supervisor @test.com, password Test1234!).
 *   2. Frontend is started automatically (reuseExistingServer keeps a running
 *      dev server if you already have one).
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // run sequentially — some API tests touch shared state
  // Single worker: the backend throttles /auth/login (20/15 min/IP, all envs).
  // One worker + the per-role token cache keeps the whole run well under that.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30000,
  reporter: process.env.CI ? [['junit', { outputFile: 'playwright-results.xml' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    // Paper specifies Chrome 120+ desktop.
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    // Paper specifies a mobile form factor — the citizen app is mobile-first.
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
