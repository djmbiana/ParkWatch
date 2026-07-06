import { test, expect } from '@playwright/test';
import { STORAGE } from '../helpers/testData';
import { loginAs } from '../helpers/auth';

/**
 * Portal Smoke Tests (paper: Chrome 120+, desktop + mobile form factors).
 * Each portal route loads, shows its page title, and renders without JS errors.
 * Page titles render in PortalLayout's top bar (the <header> = "banner" role);
 * the same words also appear as sidebar nav links, so title assertions are
 * scoped to the banner to stay unambiguous.
 *
 * New portals / features covered:
 *   - Supervisor Officers: officer table with Supervisor + Total Resolved columns
 *   - Supervisor Escalated: collapsible config panel + 3-tab Handle modal
 *   - Supervisor Reports: HTML Report button
 *   - Barangay plate search: filter toggle
 *   - Officer report detail: Additional Photos slideshow section
 *   - "Declined" label throughout (renamed from "Rejected")
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

  test('TC-P-09: A 401 from the API clears the session and redirects to /login', async ({ page }) => {
    await loginAs('barangay', page);
    await page.route('**/api/reports/queue/barangay**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Session expired' }),
      }),
    );
    await page.goto('/barangay/queue');
    await expect(page).toHaveURL(/login/, { timeout: 10000 });
    const token = await page.evaluate((keys) => localStorage.getItem(keys.token), STORAGE);
    expect(token).toBeNull();
  });

  test('TC-P-10: /privacy page is publicly accessible without authentication', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByText(/Privacy Notice/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-P-11: Officer queue action button navigates to report detail (no inline modal)', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    await page.waitForResponse((r) => r.url().includes('/queue/mtpb')).catch(() => {});
    await page.waitForTimeout(1500);

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
    await expect(page).toHaveURL(/\/mtpb\/officer\/reports\/\d+/, { timeout: 8000 });
    await expect(titleInBanner(page, 'Enforcement Queue')).toHaveCount(0);
  });

  test('TC-P-12: Admin barangays page loads with Barangay Management title', async ({ page }) => {
    await loginAs('admin', page, '/admin/barangays');
    await expect(titleInBanner(page, 'Barangay Management')).toBeVisible({ timeout: 10000 });
  });

  // --- New feature smoke tests ---

  test('TC-P-13: Supervisor officers page loads with expected columns', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/officers');
    await expect(titleInBanner(page, 'Officers')).toBeVisible({ timeout: 10000 });
    // New columns from updated listOfficers query.
    await expect(page.getByText('Supervisor', { exact: false }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Total Resolved', { exact: false }).first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-14: Supervisor officers page shows officer linked to supervisor', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/officers');
    await page.waitForTimeout(2000);
    // officer@test.com is seeded with supervisor_id = supervisor@test.com.
    // The "Test Supervisor" name should appear in the Supervisor column.
    await expect(page.getByText('Test Supervisor').first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-15: Clicking an officer row opens a profile modal with stats', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/officers');
    await page.waitForTimeout(2000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, 'No officer rows in table.');
      return;
    }
    await rows.first().click();
    // Profile modal should open showing stat pills or officer name.
    await expect(page.getByText(/Resolved Total|Active|Avg\. Resolve/i).first()).toBeVisible({
      timeout: 8000,
    });
  });

  test('TC-P-16: Supervisor escalated page has collapsible escalation config panel', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/escalated');
    await expect(page.getByText('Escalation Timing Settings')).toBeVisible({ timeout: 10000 });
    // Expand the panel.
    await page.getByText('Escalation Timing Settings').click();
    await expect(page.getByText('Response Window', { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Re-notify Window', { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test('TC-P-17: Supervisor escalated Handle modal has View Details tab', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/escalated');
    await page.waitForTimeout(2000);

    const handleBtn = page.getByRole('button', { name: 'Handle' }).first();
    const count = await handleBtn.count();
    if (count === 0) {
      test.skip(true, 'No escalated reports to test modal tabs.');
      return;
    }
    await handleBtn.click();
    // Three tabs should be visible: View Details, Assign to Officer, Resolve Directly.
    await expect(page.getByRole('button', { name: 'View Details' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Assign to Officer' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Resolve Directly' })).toBeVisible({ timeout: 5000 });
  });

  test('TC-P-18: Supervisor reports page has both CSV Export and HTML Report buttons', async ({ page }) => {
    await loginAs('supervisor', page, '/mtpb/supervisor/reports');
    await expect(page.getByRole('button', { name: /CSV Export/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /HTML Report/i })).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-19: Barangay plate search has a filter toggle button', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/plate-search');
    await expect(page.locator('button').filter({ hasText: /filter/i }).first()
      .or(page.locator('button[aria-label*="filter" i]'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('TC-P-20: Barangay queue stat card says "Declined Today" (not "Rejected Today")', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/queue');
    await expect(page.getByText('Declined Today', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Rejected Today', { exact: false })).toHaveCount(0);
  });

  test('TC-P-21: Supervisor heatmap renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loginAs('supervisor', page, '/mtpb/supervisor/reports');
    await page.waitForTimeout(4000); // allow map to initialise
    // Filter out known harmless Leaflet CSS loading warnings.
    const real = errors.filter(
      (e) => !e.toLowerCase().includes('leaflet') && !e.toLowerCase().includes('favicon'),
    );
    expect(real).toEqual([]);
  });

  test('TC-P-22: Officer report detail shows Additional Photos section', async ({ page }) => {
    await loginAs('officer', page);

    // Mock a report with additional_photos so we can verify the section renders.
    await page.route('**/api/reports/999', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 999, status: 'verified', violation_type: 'Double Parking',
            submitted_at: new Date().toISOString(),
            photo_url: 'https://via.placeholder.com/600x400.jpg',
            additional_photos: [
              'https://via.placeholder.com/400x300.jpg',
              'https://via.placeholder.com/400x300b.jpg',
            ],
            vehicle: { plate_number: 'ZZZ 9999', history: [] },
            street: { street_name: 'Adriatico Street', barangay_name: 'Barangay 726' },
            penalty_tier: { tier_name: '1st Offense', fine_amount: 0 },
            reporter: { anonymous_alias: 'Reporter #555' },
          },
        }),
      });
    });

    await page.goto('/mtpb/officer/reports/999');
    await expect(page.getByText('Additional Photos (2)')).toBeVisible({ timeout: 8000 });
    // Two thumbnail images should be rendered.
    const thumbs = page.locator('img[alt*="Additional evidence"]');
    await expect(thumbs).toHaveCount(2);
  });
});
