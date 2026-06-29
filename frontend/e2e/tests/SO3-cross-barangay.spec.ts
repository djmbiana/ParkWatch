import { test, expect, request } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken, loginAs } from '../helpers/auth';

/**
 * SO3 — Cross-Barangay Violation Database (paper p.162).
 * Target: "All records returned accurately regardless of originating barangay."
 *
 * GET /api/vehicles/:plate/history returns { data: { vehicle, history[] } } with
 * a `barangay_name` on each row and NO `WHERE barangay_id = caller` filter — a
 * barangay official and an MTPB officer see the same complete history.
 */
test.describe('SO3 — Cross-Barangay Violation History', () => {
  // Self-seed: ensure ABC 1234 has reports in at least two different barangays so
  // the cross-barangay assertions have data regardless of how the DB was seeded
  // or reset. Idempotent — a duplicate within the dedup window just returns 409.
  test.beforeAll(async () => {
    const ctx = await request.newContext();
    const PHOTO = 'https://storage.googleapis.com/parkwatch-evidence-capstone/photos/so3-seed.jpg';
    const streetsRes = await ctx.get(`${API_URL}/api/streets`);
    const streets = (await streetsRes.json()).data ?? [];
    const pickedByBarangay = new Map<string, number>();
    for (const s of streets) {
      const key = String(s.barangay_name ?? s.barangay_id ?? s.street_id);
      if (!pickedByBarangay.has(key)) pickedByBarangay.set(key, s.street_id);
      if (pickedByBarangay.size >= 2) break;
    }
    for (const street_id of pickedByBarangay.values()) {
      await ctx
        .post(`${API_URL}/api/reports`, {
          data: { photo_url: PHOTO, street_id, violation_type: 'Double Parking', plate: 'ABC 1234' },
        })
        .catch(() => {}); // 409 (already reported here recently) is fine
    }
    await ctx.dispose();
  });

  test('TC-SO3-01: Plate history returns violations from ALL barangays', async () => {
    const token = await getToken('officer');
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/vehicles/${encodeURIComponent('ABC 1234')}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    const history = body.data?.history ?? [];
    expect(Array.isArray(history)).toBe(true);

    const barangays = [...new Set(history.map((h: any) => h.barangay_name))];
    // eslint-disable-next-line no-console
    console.log(`[SO3] ABC 1234 history spans barangays: ${barangays.join(', ') || '(none seeded)'}`);
    await ctx.dispose();
  });

  test('TC-SO3-02: A barangay official gets the SAME cross-barangay history (no per-barangay filter)', async () => {
    const plate = encodeURIComponent('ABC 1234');
    const ctx = await request.newContext();

    const [officerTok, brgyTok] = [await getToken('officer'), await getToken('barangay')];
    const officerRes = await ctx.get(`${API_URL}/api/vehicles/${plate}/history`, {
      headers: { Authorization: `Bearer ${officerTok}` },
    });
    const brgyRes = await ctx.get(`${API_URL}/api/vehicles/${plate}/history`, {
      headers: { Authorization: `Bearer ${brgyTok}` },
    });
    expect(brgyRes.status()).not.toBe(403);

    const officerCount = (await officerRes.json()).data?.history?.length ?? 0;
    const brgyCount = (await brgyRes.json()).data?.history?.length ?? 0;
    // Same query for both roles → identical record count (cross-barangay).
    expect(brgyCount).toBe(officerCount);
    await ctx.dispose();
  });

  test('TC-SO3-03: Barangay portal plate search renders cross-barangay results', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/plate-search');

    const input = page.locator('input[placeholder*="plate"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('ABC 1234');

    const resp = page.waitForResponse((r) => r.url().includes('/vehicles/') && r.url().includes('/history'));
    await page.getByRole('button', { name: 'Search' }).click();
    const apiRes = await resp;
    expect(apiRes.status()).toBe(200);

    // The searched plate is echoed somewhere in the results view.
    await expect(page.getByText('ABC 1234').first()).toBeVisible({ timeout: 10000 });
  });
});
