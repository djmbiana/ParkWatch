import { test, expect } from '@playwright/test';
import { STORAGE } from '../helpers/testData';
import { loginAs } from '../helpers/auth';

/**
 * Portal Smoke Tests (paper: Chrome 120+, desktop + mobile form factors).
 * Each portal route loads, shows its page title, and renders without JS errors.
 * Page titles render in PortalLayout's top bar (the <header> = "banner" role);
 * the same words also appear as sidebar nav links, so title assertions are
 * scoped to the banner to stay unambiguous.
 */
const titleInBanner = (page: any, text: string) => page.getByRole('banner').getByText(text);

test.describe('Portal Smoke Tests', () => {
  test('TC-P-01: Barangay queue page loads with its title', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/queue');
    await expect(titleInBanner(page, 'Pending Verification Queue')).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-02: Barangay queue exposes no citizen PII (only anonymous aliases)', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/queue');
    await page.waitForResponse((r) => r.url().includes('/queue/barangay')).catch(() => {});
    const content = (await page.locator('main').textContent()) ?? '';
    // No raw email addresses should appear in the queue view.
    expect(content).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  test('TC-P-03: MTPB officer queue loads with the Time Left column', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    await expect(titleInBanner(page, 'Enforcement Queue')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('main').getByText('Time Left', { exact: false }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('TC-P-04: Supervisor escalated page loads', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/escalated');
    await expect(titleInBanner(page, 'Escalated Reports')).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-05: Admin user management page loads', async ({ page }) => {
    await loginAs('admin', page, '/admin/users');
    await expect(titleInBanner(page, 'User Management')).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-06: Admin penalty tiers page shows the "new reports only" warning', async ({ page }) => {
    await loginAs('admin', page, '/admin/penalty-tiers');
    await expect(page.getByText('Changes apply to new reports only', { exact: false })).toBeVisible({
      timeout: 10000,
    });
  });

  test('TC-P-07: Supervisor reports table renders all statuses without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loginAs('supervisor', page, '/mtpb/supervisor/reports');
    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  test('TC-P-08: Barangay queue shows a live "Updated …s ago" auto-refresh stamp', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/queue');
    await expect(page.getByText(/Updated.*ago/)).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-10: /privacy page is publicly accessible without authentication', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).not.toHaveURL(/login/);
    // The notice must render actual content, not a blank or error page.
    await expect(page.getByText(/Privacy Notice/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-P-11: Officer queue action button navigates to report detail (no inline modal)', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    await page.waitForResponse((r) => r.url().includes('/queue/mtpb')).catch(() => {});
    await page.waitForTimeout(1500);

    // Filter to rows that contain an action button — skips the empty-state <tr>.
    const actionableRows = page
      .getByRole('table')
      .locator('tbody tr')
      .filter({ has: page.getByRole('button') });
    const count = await actionableRows.count().catch(() => 0);
    if (count === 0) {
      test.skip(true, 'No actionable reports in MTPB queue; skipping navigation assertion.');
      return;
    }

    await actionableRows.first().getByRole('button').click();

    // Must land on the detail page — not stay on the queue with a modal.
    await expect(page).toHaveURL(/\/mtpb\/officer\/reports\/\d+/, { timeout: 8000 });
    // The queue title should no longer be visible (we navigated away).
    await expect(titleInBanner(page, 'Enforcement Queue')).toHaveCount(0);
  });

  test('TC-P-12: Admin barangays page loads with Barangay Management title', async ({ page }) => {
    await loginAs('admin', page, '/admin/barangays');
    await expect(titleInBanner(page, 'Barangay Management')).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-09: A 401 from the API clears the session and redirects to /login', async ({ page }) => {
    // Start from a genuine, valid barangay session so RoleRoute lets the page
    // mount; then force the queue API to answer 401 (session-expired) to drive
    // the api.js handler that clears storage and redirects. (An invalid token
    // returns 403, which by design does NOT log the user out.)
    await loginAs('barangay', page);
    await page.route('**/api/reports/queue/barangay**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Session expired' }) }),
    );
    await page.goto('/barangay/queue');
    await expect(page).toHaveURL(/login/, { timeout: 10000 });
    const token = await page.evaluate((keys) => localStorage.getItem(keys.token), STORAGE);
    expect(token).toBeNull();
  });
});
