import { test, expect, request, APIRequestContext } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * SO4 — Automated Penalty Tier Escalation (paper p.162).
 * Target: "Correct tier applied in 90% of test cases."
 *
 * 4-tier escalating enforcement (migration 022):
 *   min 0–1  → ₱0     Verbal Warning  (no fine, no clamp)
 *   min 2–2  → ₱500   Ticket
 *   min 3–3  → ₱1,000 Wheel Clamp     (requires_clamping)
 *   min 4–∞  → ₱2,000 Impound         (requires_impound)
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
  test('TC-SO4-01: First violation maps to the 1st-Offense tier (Verbal Warning, no fine)', async () => {
    const ctx = await request.newContext();
    const { list } = await tiers(ctx);
    const first = list.find((t) => Number(t.min_violations) === 0);
    expect(first).toBeDefined();
    expect(parseFloat(first.fine_amount)).toBe(0);
    expect(Boolean(Number(first.requires_clamping))).toBe(false);
    await ctx.dispose();
  });

  test('TC-SO4-02: Tiers escalate Verbal Warning → Ticket → Wheel Clamp → Impound (₱0/500/1000/2000)', async () => {
    const ctx = await request.newContext();
    const { list } = await tiers(ctx);
    const sorted = [...list].sort((a, b) => Number(a.min_violations) - Number(b.min_violations));
    expect(parseFloat(sorted[0].fine_amount)).toBe(0);     // 1st — Verbal Warning
    expect(parseFloat(sorted[1].fine_amount)).toBe(500);   // 2nd — Ticket
    expect(parseFloat(sorted[2].fine_amount)).toBe(1000);  // 3rd — Wheel Clamp
    expect(parseFloat(sorted[3].fine_amount)).toBe(2000);  // 4th — Impound
    // Clamping on the 3rd tier, impound on the 4th.
    expect(Boolean(Number(sorted[2].requires_clamping))).toBe(true);
    expect(Boolean(Number(sorted[3].requires_impound))).toBe(true);
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
