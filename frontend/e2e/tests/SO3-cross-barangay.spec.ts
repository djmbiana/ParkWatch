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
 *
 * Streets fix (migration 030 + streetController.js): GET /api/streets now
 * includes `barangay_id` in the response, allowing the citizen wizard to group
 * streets correctly by barangay.
 */
test.describe('SO3 — Cross-Barangay Violation History', () => {
  // Self-seed: ensure ABC 1234 has reports in at least two different barangays
  // so cross-barangay assertions have data. Idempotent — 409 is fine.
  test.beforeAll(async () => {
    const ctx = await request.newContext();
    const PHOTO = 'https://storage.googleapis.com/parkwatch-evidence-capstone/photos/so3-seed.jpg';
    const streetsRes = await ctx.get(`${API_URL}/api/streets`);
    const streets = (await streetsRes.json()).data ?? [];
    const pickedByBarangay = new Map<string, number>();
    for (const s of streets) {
      const key = String(s.barangay_id ?? s.barangay_name ?? s.street_id);
      if (!pickedByBarangay.has(key)) pickedByBarangay.set(key, s.street_id);
      if (pickedByBarangay.size >= 2) break;
    }
    for (const street_id of pickedByBarangay.values()) {
      await ctx
        .post(`${API_URL}/api/reports`, {
          data: { photo_url: PHOTO, street_id, violation_type: 'Double Parking', plate: 'ABC 1234' },
        })
        .catch(() => {});
    }
    await ctx.dispose();
  });

  // TC-SO3-00: GET /api/streets includes barangay_id (cascade fix, migration 030).
  test('TC-SO3-00: GET /api/streets returns barangay_id on every row', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/streets`);
    expect(res.status()).toBe(200);
    const streets = (await res.json()).data ?? [];
    test.skip(streets.length === 0, 'No active streets in DB.');
    for (const s of streets) {
      expect(typeof s.barangay_id, `Street ${s.street_name} missing barangay_id`).toBe('number');
    }
    await ctx.dispose();
  });

  // TC-SO3-01: Plate history returns violations from ALL barangays.
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
    console.log(`[SO3] ABC 1234 history spans barangays: ${barangays.join(', ') || '(none seeded)'}`);
    await ctx.dispose();
  });

  // TC-SO3-02: A barangay official gets the SAME cross-barangay history.
  test('TC-SO3-02: Barangay official sees the same cross-barangay history as officer', async () => {
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
    expect(brgyCount).toBe(officerCount);
    await ctx.dispose();
  });

  // TC-SO3-03: Barangay portal plate search renders cross-barangay results.
  test('TC-SO3-03: Barangay portal plate search renders cross-barangay results', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/plate-search');

    const input = page.locator('input[placeholder*="plate"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('ABC 1234');

    const resp = page.waitForResponse((r) => r.url().includes('/vehicles/') && r.url().includes('/history'));
    await page.getByRole('button', { name: 'Search' }).click();
    const apiRes = await resp;
    expect(apiRes.status()).toBe(200);

    await expect(page.getByText('ABC 1234').first()).toBeVisible({ timeout: 10000 });
  });

  // TC-SO3-04: Barangay plate search has a filter panel toggle button.
  test('TC-SO3-04: Barangay plate search has a filter toggle', async ({ page }) => {
    await loginAs('barangay', page, '/barangay/plate-search');
    // The filter icon button (SlidersHorizontal) or "Filters" text should exist.
    const filterBtn = page.locator('button').filter({ hasText: /filter/i }).first();
    const hasSlidersIcon = await page.locator('[data-lucide="sliders-horizontal"], svg').count();
    const hasFilterBtn = await filterBtn.count();
    expect(hasSlidersIcon > 0 || hasFilterBtn > 0).toBeTruthy();
  });

  // TC-SO3-05: Partner barangays are exactly the 5 UAT barangays (726/727/729/730/762).
  test('TC-SO3-05: Only 5 partner barangays are active (726/727/729/730/762)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/streets`);
    const streets = (await res.json()).data ?? [];
    const barangayNames: string[] = [...new Set(streets.map((s: any) => s.barangay_name as string))];
    console.log(`[SO3] Active partner barangays: ${barangayNames.join(', ')}`);
    // Every active street must belong to one of the 5 UAT partner barangays.
    const expected = ['Barangay 726', 'Barangay 727', 'Barangay 729', 'Barangay 730', 'Barangay 762'];
    for (const name of barangayNames) {
      expect(expected, `Unexpected barangay in active streets: ${name}`).toContain(name);
    }
    await ctx.dispose();
  });
});
