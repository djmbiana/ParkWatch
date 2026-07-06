import { test, expect, request } from '@playwright/test';
import { API_URL, ESCALATION_CONFIG_KEYS } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * SO5 — Report Queue, Re-notification & Escalation (paper p.162).
 * Target: "Re-notification and escalation triggered on schedule with no manual
 * intervention."
 *
 * The time-based escalation runs from a cron job; a full schedule test needs DB
 * time travel. Here we verify the API-observable invariants: queues exist and
 * are role-scoped, the status guard blocks out-of-order transitions, escalated
 * reports carry an escalation reason, and (new: migration 032) the supervisor
 * can configure the escalation timing windows via SYSTEM_CONFIG.
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

  test('TC-SO5-04: Status guard blocks out-of-order transitions (dispatch escalated → 422)', async () => {
    const ctx = await request.newContext();
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

  test('TC-SO5-05: Escalated reports carry a non-empty escalation reason', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/supervisor`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const escalated = rowsOf(await res.json()).filter((r) => r.status === 'escalated');
    if (escalated.length === 0) {
      test.skip(true, 'No escalated reports present to verify escalation_reason.');
    }
    for (const r of escalated) {
      expect(r.escalation_reason).toBeTruthy();
      expect(String(r.escalation_reason).toLowerCase()).toContain('re-notification');
    }
    await ctx.dispose();
  });

  // --- Escalation config tests (migration 032 SYSTEM_CONFIG) ---

  test('TC-SO5-06: GET /admin/system-config/escalation returns current windows', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    expect(res.status()).toBe(200);
    const rows: any[] = (await res.json()) ?? [];
    const keys = rows.map((r: any) => r.config_key);
    expect(keys).toContain(ESCALATION_CONFIG_KEYS.responseWindow);
    expect(keys).toContain(ESCALATION_CONFIG_KEYS.renotifyWindow);

    const resp = rows.find((r: any) => r.config_key === ESCALATION_CONFIG_KEYS.responseWindow);
    expect(parseInt(resp.config_value, 10)).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('TC-SO5-07: Supervisor can update escalation windows via PATCH', async () => {
    const ctx = await request.newContext();

    // Read current values first.
    const getRes = await ctx.get(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const before: any[] = (await getRes.json()) ?? [];
    const origResponse = parseInt(
      before.find((r: any) => r.config_key === ESCALATION_CONFIG_KEYS.responseWindow)?.config_value ?? '60',
      10,
    );

    // Update to a different value.
    const newVal = origResponse === 60 ? 45 : 60;
    const patchRes = await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
      data: { response_window_minutes: newVal },
    });
    expect(patchRes.status()).toBe(200);

    // Verify the change persisted.
    const getRes2 = await ctx.get(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const after: any[] = (await getRes2.json()) ?? [];
    const updated = parseInt(
      after.find((r: any) => r.config_key === ESCALATION_CONFIG_KEYS.responseWindow)?.config_value ?? '0',
      10,
    );
    expect(updated).toBe(newVal);

    // Restore original value so other tests aren't affected.
    await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
      data: { response_window_minutes: origResponse },
    });
    await ctx.dispose();
  });

  test('TC-SO5-08: Escalation config rejects out-of-range values (422)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
      data: { response_window_minutes: 9999 }, // > 1440 max
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test('TC-SO5-09: MTPB officer cannot update escalation config (403)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
      data: { response_window_minutes: 30 },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-SO5-10: Escalation config requires authentication (401 without token)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/admin/system-config/escalation`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
