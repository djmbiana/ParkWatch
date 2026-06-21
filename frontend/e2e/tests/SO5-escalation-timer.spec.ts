import { test, expect, request } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * SO5 — Report Queue, Re-notification & Escalation (paper p.162).
 * Target: "Re-notification and escalation triggered on schedule with no manual
 * intervention."
 *
 * The time-based escalation itself runs from a cron job (backend/src/jobs); a
 * full schedule test needs DB time travel. Here we verify the API-observable
 * invariants: the queues exist and are role-scoped, the status guard blocks
 * out-of-order transitions, and escalated reports carry an escalation reason.
 */
function rowsOf(body: any): any[] {
  const d = body?.data ?? body;
  if (Array.isArray(d)) return d;
  return d?.reports ?? d?.history ?? [];
}

test.describe('SO5 — Report Queue, Re-notification & Escalation', () => {
  test('TC-SO5-01: Supervisor queue is reachable and well-formed', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/supervisor`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(rowsOf(body))).toBe(true);
    await ctx.dispose();
  });

  test('TC-SO5-02: A manual escalation trigger endpoint is optional (200 or 404)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/api/test/trigger-escalation`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
    });
    // Either a test-only trigger exists (200) or escalation is cron-only (404).
    expect([200, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test('TC-SO5-03: Escalated reports do NOT appear in the MTPB officer queue', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/mtpb`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
    });
    const escalated = rowsOf(await res.json()).filter(
      (r) => r.is_escalated === true || r.status === 'escalated',
    );
    expect(escalated.length).toBe(0);
    await ctx.dispose();
  });

  test('TC-SO5-04: Status guard blocks out-of-order transitions (dispatch an escalated report → 422)', async () => {
    const ctx = await request.newContext();
    // Find an escalated report and try to DISPATCH it. dispatch is only legal
    // from 'acknowledged', so the centralized statusGuard must reject it (422)
    // rather than letting the lifecycle skip a stage.
    const supRes = await ctx.get(`${API_URL}/api/reports/queue/supervisor`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const escalated = rowsOf(await supRes.json()).find((r) => r.status === 'escalated');
    test.skip(!escalated, 'No escalated report available to exercise the status guard.');

    const res = await ctx.patch(`${API_URL}/api/reports/${escalated.report_id}/dispatch`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test('TC-SO5-05: Escalated reports carry an escalation reason (two-stage evidence)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/supervisor`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    // Only currently-escalated reports carry an active reason; a report that was
    // escalated and later resolved keeps is_escalated=true but clears the reason.
    const escalated = rowsOf(await res.json()).filter((r) => r.status === 'escalated');
    if (escalated.length === 0) {
      test.skip(true, 'No escalated reports present to verify escalation_reason.');
    }
    for (const r of escalated) {
      // eslint-disable-next-line no-console
      console.log(`[SO5] report ${r.report_id} escalation_reason: ${r.escalation_reason ?? '(null)'}`);
      // The escalated row must surface a non-empty reason — evidence that the
      // two-stage re-notification → escalation flow recorded WHY it escalated.
      expect(r.escalation_reason).toBeTruthy();
      expect(String(r.escalation_reason).toLowerCase()).toContain('re-notification');
    }
    await ctx.dispose();
  });
});
