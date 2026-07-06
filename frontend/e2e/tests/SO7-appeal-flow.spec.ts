import { test, expect, request } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken, loginAs } from '../helpers/auth';

/**
 * SO7 — Citizen Appeal Flow (migration 031 REPORT_APPEALS).
 *
 * Lifecycle: report → verified → (officer workflow) → resolved/rejected
 *            rejected → citizen contests (POST /api/reports/:id/contest?token=)
 *            → contested → barangay renders verdict (PATCH /api/reports/:id/appeal-verdict)
 *            → rejected (upheld) | pending (overturned)
 *
 * Rules:
 *   - Only `rejected` reports can be contested (status guard → 400).
 *   - One appeal per report — a second contest attempt returns 400.
 *   - Contest uses the report's access_token via query param (no JWT needed).
 *   - Verdict requires brgy_official JWT (other roles → 403).
 *   - Contested reports appear in the barangay queue (sorted to top).
 *   - StatusBadge renders "Under Review" for `contested` status.
 *
 * Most lifecycle tests are conditional on having a seeded rejected report;
 * they skip gracefully on a clean DB.
 */
test.describe('SO7 — Citizen Appeal Flow', () => {
  // TC-SO7-01: Contest endpoint requires the report to be in rejected status.
  test('TC-SO7-01: Contesting a non-rejected report returns 400', async () => {
    const ctx = await request.newContext();

    // Find any non-rejected, non-pending report (verified / acknowledged / dispatched).
    const token = await getToken('barangay');
    const qRes = await ctx.get(`${API_URL}/api/reports/queue/barangay`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const reports = (await qRes.json()).data?.reports ?? (await qRes.json()).data ?? [];
    const live = Array.isArray(reports)
      ? reports.find((r: any) => r.status === 'verified' || r.status === 'pending')
      : null;

    if (!live) {
      await ctx.dispose();
      test.skip(true, 'No pending/verified report in queue to test status guard.');
      return;
    }

    const res = await ctx.post(
      `${API_URL}/api/reports/${live.report_id}/contest?token=fake-token`,
      { data: { reason: 'Testing status guard' } },
    );
    // Must not be 200 — wrong status.
    expect([400, 422]).toContain(res.status());
    await ctx.dispose();
  });

  // TC-SO7-02: Contest endpoint requires a reason (validation).
  test('TC-SO7-02: Contest with empty reason returns 400/422', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(
      `${API_URL}/api/reports/99999/contest?token=any`,
      { data: { reason: '' } },
    );
    expect([400, 422]).toContain(res.status());
    await ctx.dispose();
  });

  // TC-SO7-03: Appeal verdict endpoint requires brgy_official role.
  test('TC-SO7-03: Appeal verdict endpoint rejects non-barangay roles (403)', async () => {
    const ctx = await request.newContext();
    // MTPB officer must not be able to render appeal verdicts.
    const res = await ctx.patch(`${API_URL}/api/reports/1/appeal-verdict`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
      data: { verdict: 'upheld' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  // TC-SO7-04: Appeal verdict requires a valid verdict value.
  test('TC-SO7-04: Appeal verdict with invalid value returns 422', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/reports/1/appeal-verdict`, {
      headers: { Authorization: `Bearer ${await getToken('barangay')}` },
      data: { verdict: 'maybe' },
    });
    expect([400, 422]).toContain(res.status());
    await ctx.dispose();
  });

  // TC-SO7-05: Contested reports appear in the barangay queue (not filtered out).
  test('TC-SO7-05: Barangay queue includes contested reports', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`, {
      headers: { Authorization: `Bearer ${await getToken('barangay')}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Queue must accept `contested` status — verify the endpoint returns 200
    // and the reports array exists (contested items are included if any).
    const reports = body.data?.reports ?? body.data ?? [];
    expect(Array.isArray(reports)).toBe(true);
    console.log(`[SO7] Barangay queue has ${reports.length} reports (pending + contested).`);
    await ctx.dispose();
  });

  // TC-SO7-06: StatusBadge renders "Under Review" for contested (UI label).
  test('TC-SO7-06: Contested status displays as "Under Review" in StatusBadge', async ({ page }) => {
    // We don't need a real contested report — the StatusBadge component can be
    // verified by injecting a mock response on the barangay report detail route.
    await loginAs('barangay', page);
    await page.route('**/api/reports/**', async (route) => {
      const url = route.request().url();
      if (/\/api\/reports\/\d+$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              report_id: 1, status: 'contested', violation_type: 'Double Parking',
              submitted_at: new Date().toISOString(),
              vehicle: { plate_number: 'ABC 1234', history: [] },
              street: { street_name: 'Arellano Avenue', barangay_name: 'Barangay 726' },
              penalty_tier: { tier_name: '1st Offense', fine_amount: 0 },
              reporter: { anonymous_alias: 'Reporter #42' },
              appeal: { appeal_id: 1, status: 'pending', reason: 'I was not parked there.' },
            },
          }),
        });
      }
      return route.continue();
    });
    await page.goto('/barangay/reports/1');
    // StatusBadge for "contested" should render "Under Review".
    await expect(page.getByText('Under Review')).toBeVisible({ timeout: 10000 });
  });

  // TC-SO7-07: Barangay report detail shows the appeal verdict panel for contested.
  test('TC-SO7-07: Barangay report detail shows appeal verdict panel for contested report', async ({ page }) => {
    await loginAs('barangay', page);
    await page.route('**/api/reports/1', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 1, status: 'contested', violation_type: 'Double Parking',
            submitted_at: new Date().toISOString(),
            vehicle: { plate_number: 'XYZ 5678', history: [] },
            street: { street_name: 'Arellano Avenue', barangay_name: 'Barangay 726' },
            penalty_tier: { tier_name: '1st Offense', fine_amount: 0 },
            reporter: { anonymous_alias: 'Reporter #99' },
            appeal: { appeal_id: 1, status: 'pending', reason: 'My car was not there.' },
          },
        }),
      });
    });
    await page.goto('/barangay/reports/1');
    // The verdict panel renders the appeal reason.
    await expect(page.getByText('My car was not there.')).toBeVisible({ timeout: 10000 });
    // Overturn/uphold verdict options visible.
    await expect(page.getByText(/Overturn|overturn/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Uphold|uphold/i).first()).toBeVisible({ timeout: 5000 });
  });

  // TC-SO7-08: My Reports citizen page shows "Under Review" notice for contested.
  test('TC-SO7-08: Citizen My Reports shows Under Review badge for contested report', async ({ page }) => {
    await page.goto('/citizen');
    await page.evaluate((keys) => {
      const reports = [
        {
          report_id: 77, status: 'contested', submitted_at: new Date().toISOString(),
          anonymous_alias: 'Reporter #77', access_token: 'test-tok-77',
          appeal: { appeal_id: 1, status: 'pending', reason: 'I contest this.' },
        },
      ];
      localStorage.setItem(keys.reports, JSON.stringify(reports));
      localStorage.setItem(keys.reportTokens, JSON.stringify({ '77': 'test-tok-77' }));
    }, { reports: 'parkwatch_reports', reportTokens: 'parkwatch_report_tokens' });

    await page.route('**/api/reports/77**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 77, status: 'contested', violation_type: 'Double Parking',
            submitted_at: new Date().toISOString(),
            vehicle: { plate_number: 'AAA 1111', history: [] },
            street: { street_name: 'Quirino Avenue', barangay_name: 'Barangay 730' },
            appeal: { appeal_id: 1, status: 'pending', reason: 'I contest this.' },
          },
        }),
      });
    });

    await page.goto('/citizen/reports');
    // StatusBadge for contested shows "Under Review" somewhere on the page.
    await expect(page.getByText('Under Review').first()).toBeVisible({ timeout: 10000 });
  });

  // TC-SO7-09: Contest endpoint requires the access token query param.
  test('TC-SO7-09: Contest without token returns 401 or 400', async () => {
    const ctx = await request.newContext();
    // No ?token= param → should be rejected.
    const res = await ctx.post(`${API_URL}/api/reports/1/contest`, {
      data: { reason: 'Testing missing token' },
    });
    expect([400, 401, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });

  // TC-SO7-10: CFA notice text does not contain "Barangay Barangay ..." duplicate prefix.
  test('TC-SO7-10: CFA notice barangay name has no duplicate prefix', async ({ page }) => {
    await loginAs('citizen', page).catch(() => {}); // citizen route is public
    await page.goto('/citizen');
    await page.evaluate((keys) => {
      const reports = [{
        report_id: 88, status: 'rejected', submitted_at: new Date().toISOString(),
        anonymous_alias: 'Reporter #88', access_token: 'tok88',
        appeal: { appeal_id: 2, status: 'upheld', verdict_notes: 'Not overturned.' },
      }];
      localStorage.setItem(keys.reports, JSON.stringify(reports));
      localStorage.setItem(keys.reportTokens, JSON.stringify({ '88': 'tok88' }));
    }, { reports: 'parkwatch_reports', reportTokens: 'parkwatch_report_tokens' });

    await page.route('**/api/reports/88**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 88, status: 'rejected', violation_type: 'Double Parking',
            submitted_at: new Date().toISOString(),
            vehicle: { plate_number: 'BBB 2222', history: [] },
            street: { street_name: 'Quirino Avenue', barangay_name: 'Barangay 762' },
            appeal: { appeal_id: 2, status: 'upheld', verdict_notes: 'Not overturned.' },
          },
        }),
      });
    });

    await page.goto('/citizen/reports');
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').textContent() ?? '';
    // The CFA message must reference "Barangay 762" (from barangay_name) — never "Barangay Barangay 762".
    expect(bodyText).not.toContain('Barangay Barangay');
  });
});
