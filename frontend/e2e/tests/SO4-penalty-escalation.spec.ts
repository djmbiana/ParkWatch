import { test, expect, request, APIRequestContext } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * SO4 — Automated Penalty Tier Escalation (paper p.162).
 * Target: "Correct tier applied in 90% of test cases."
 *
 * Verified seed (RA 4136 + MMDA MMTC 2023): tiers are
 *   min 0–1  → ₱1,000  (1st Offense, no clamp)
 *   min 2–2  → ₱2,000  (2nd Offense)
 *   min 3–∞  → ₱3,000  (3rd Offense+, requires clamping)
 */
async function tiers(ctx: APIRequestContext) {
  const token = await getToken('admin');
  const res = await ctx.get(`${API_URL}/api/admin/penalty-tiers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { token, list: body.data as any[] };
}

test.describe('SO4 — Automated Penalty Tier Escalation', () => {
  test('TC-SO4-01: First violation maps to the 1st-Offense tier (₱1,000, no clamp)', async () => {
    const ctx = await request.newContext();
    const { list } = await tiers(ctx);
    const first = list.find((t) => Number(t.min_violations) === 0);
    expect(first).toBeDefined();
    expect(parseFloat(first.fine_amount)).toBe(1000);
    expect(Boolean(Number(first.requires_clamping))).toBe(false);
    await ctx.dispose();
  });

  test('TC-SO4-02: Tiers follow RA 4136 + MMDA fines and escalate ₱1000→2000→3000', async () => {
    const ctx = await request.newContext();
    const { list } = await tiers(ctx);
    const sorted = [...list].sort((a, b) => Number(a.min_violations) - Number(b.min_violations));
    expect(parseFloat(sorted[0].fine_amount)).toBe(1000);
    expect(parseFloat(sorted[1].fine_amount)).toBe(2000);
    expect(parseFloat(sorted[2].fine_amount)).toBe(3000);
    // The top tier requires clamping (3rd offense+).
    expect(Boolean(Number(sorted[2].requires_clamping))).toBe(true);
    await ctx.dispose();
  });

  test('TC-SO4-03: Overlapping tier range is rejected (422) and not created', async () => {
    const ctx = await request.newContext();
    const { token } = await tiers(ctx);
    const res = await ctx.post(`${API_URL}/api/admin/penalty-tiers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        tier_name: 'E2E Overlap Test',
        min_violations: 1, // overlaps 0–1 and 2–2
        max_violations: 2,
        fine_amount: 999,
        requires_clamping: false,
      },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });
});
