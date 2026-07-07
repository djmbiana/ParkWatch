/**
 * mtpb-officer.spec.ts — MTPB Officer Portal
 *
 * FR-13: Officer receives verified reports, can acknowledge → dispatch → resolve
 * FR-17: Officer plate search shows cross-barangay history
 *
 * Post-ISPROJ1 additions tested:
 *   - RBAC: officer cannot access barangay queue, supervisor queue, or admin panel
 *   - Additional Photos section visible in report detail
 *   - Responsive layout: sidebar collapses on mobile viewport
 *
 * The MTPB officer queue only shows verified + acknowledged + dispatched reports
 * where is_escalated = FALSE (escalated reports go to supervisor queue).
 *
 * Functional flow tests that mutate state (acknowledge, dispatch, resolve) use the
 * real backend via loginAs + submitReportViaAPI + approveReportViaAPI.
 * Structural tests mock the queue endpoint for determinism.
 */

import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { MOCK_VERIFIED_REPORT } from '../helpers/pages';
import { submitReportViaAPI, approveReportViaAPI } from '../helpers/api';
import { API_URL } from '../helpers/testData';

// ─────────────────────────────────────────────────────────────────────────────
// FR-13: MTPB officer queue — structural
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-13: Officer queue structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/reports/queue/mtpb', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [MOCK_VERIFIED_REPORT] }),
      });
    });
  });

  test('TC-OFF-01: Officer queue page loads with enforcement queue heading', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    await expect(page.getByRole('heading', { name: /queue|enforcement/i })).toBeVisible({ timeout: 8000 });
  });

  test('TC-OFF-02: Queue shows a verified report with Acknowledge button', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    await page.getByText(MOCK_VERIFIED_REPORT.plate).first().click();
    await expect(page.getByRole('button', { name: /Acknowledge/i })).toBeVisible({ timeout: 6000 });
  });

  test('TC-OFF-03: Queue row shows the Time Left countdown column', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    // The queue should display a time-remaining indicator per report
    await expect(page.getByText(/time left|remaining|expires/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-13: Action pipeline — acknowledge → dispatch → resolve (real backend)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-13: Action pipeline (real backend)', () => {
  test('TC-OFF-04: Officer can acknowledge a verified report', async ({ page, request }) => {
    const { report_id } = await submitReportViaAPI(request);
    await approveReportViaAPI(request, report_id);
    const { token } = await loginAs('officer', page);
    const res = await request.patch(`${API_URL}/api/reports/${report_id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('TC-OFF-05: Officer can dispatch an acknowledged report', async ({ page, request }) => {
    const { report_id } = await submitReportViaAPI(request);
    await approveReportViaAPI(request, report_id);
    const { token } = await loginAs('officer', page);
    await request.patch(`${API_URL}/api/reports/${report_id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await request.patch(`${API_URL}/api/reports/${report_id}/dispatch`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
  });

  test('TC-OFF-06: Officer can resolve a dispatched report', async ({ page, request }) => {
    const { report_id } = await submitReportViaAPI(request);
    await approveReportViaAPI(request, report_id);
    const { token } = await loginAs('officer', page);
    await request.patch(`${API_URL}/api/reports/${report_id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await request.patch(`${API_URL}/api/reports/${report_id}/dispatch`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await request.patch(`${API_URL}/api/reports/${report_id}/resolve`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { outcome: 'Ticket issued' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('TC-OFF-07: Cannot acknowledge an already-acknowledged report (status guard)', async ({ page, request }) => {
    const { report_id } = await submitReportViaAPI(request);
    await approveReportViaAPI(request, report_id);
    const { token } = await loginAs('officer', page);
    await request.patch(`${API_URL}/api/reports/${report_id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Second acknowledge on same report
    const res = await request.patch(`${API_URL}/api/reports/${report_id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(409); // requireStatus guard → conflict
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBAC: Officer cannot access pages above their role
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC: Officer access restrictions', () => {
  test('TC-OFF-08: Officer is redirected away from the Barangay queue', async ({ page }) => {
    await loginAs('officer', page, '/barangay/queue');
    // Should NOT be on the barangay queue — expect redirect or 403 screen
    await expect(page).not.toHaveURL(/\/barangay\/queue/);
  });

  test('TC-OFF-09: Officer is redirected away from the Supervisor escalated queue', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/supervisor');
    await expect(page).not.toHaveURL(/\/mtpb\/supervisor/);
  });

  test('TC-OFF-10: Officer is redirected away from the Admin panel', async ({ page }) => {
    await loginAs('officer', page, '/admin/users');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('TC-OFF-11: Officer navigation does not show Admin or Supervisor nav items', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/queue');
    // Admin and supervisor-only links should not appear in the sidebar
    await expect(page.getByRole('link', { name: /admin panel/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /supervisor/i })).toHaveCount(0);
  });

  test('TC-OFF-12: Direct GET /api/admin/users returns 401/403 for officer token', async ({ page, request }) => {
    const { token } = await loginAs('officer', page);
    const res = await request.get(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-17: Plate search from the officer portal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-17: Plate search from officer portal', () => {
  test('TC-OFF-13: Plate search page is accessible from officer portal', async ({ page }) => {
    await loginAs('officer', page, '/mtpb/officer/plate-search');
    const input = page.getByRole('textbox', { name: /plate/i })
      .or(page.locator('input[placeholder*="plate" i]'))
      .first();
    await expect(input).toBeVisible({ timeout: 8000 });
  });

  test('TC-OFF-14: Plate search returns results from all barangays', async ({ page }) => {
    await page.route('**/api/reports**', async (route, request_) => {
      if (request_.url().includes('plate=') || request_.method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              { ...MOCK_VERIFIED_REPORT, barangay_name: 'Barangay 726', report_id: 11 },
              { ...MOCK_VERIFIED_REPORT, barangay_name: 'Barangay 762', report_id: 12 },
            ],
          }),
        });
        return;
      }
      route.continue();
    });
    await loginAs('officer', page, '/mtpb/officer/plate-search');
    const input = page.locator('input[placeholder*="plate" i]').first();
    await input.fill('ABC 1234');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Barangay 726')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Barangay 762')).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-ISPROJ1: Additional photos in report detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Post-ISPROJ1: Report detail additional photos', () => {
  test('TC-OFF-15: Report detail shows Additional Photos section', async ({ page }) => {
    await page.route('**/api/reports/queue/mtpb', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            ...MOCK_VERIFIED_REPORT,
            additional_photos: ['https://example.com/a.jpg'],
          }],
        }),
      });
    });
    await loginAs('officer', page, '/mtpb/officer/queue');
    await page.getByText(MOCK_VERIFIED_REPORT.plate).first().click();
    await expect(page.getByText(/additional photos|extra photos/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-ISPROJ1: Mobile responsive sidebar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Post-ISPROJ1: Mobile viewport', () => {
  test('TC-OFF-16: Sidebar collapses to a hamburger/drawer on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
    await loginAs('officer', page, '/mtpb/officer/queue');
    // On mobile, sidebar should not be permanently visible — expect a toggle button
    await expect(
      page.getByRole('button', { name: /menu|open.*nav|hamburger/i })
        .or(page.locator('[aria-label*="menu" i]'))
    ).toBeVisible({ timeout: 6000 });
  });
});
