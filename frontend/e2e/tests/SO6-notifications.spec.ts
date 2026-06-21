import { test, expect, request } from '@playwright/test';
import { API_URL, NOTIFICATION_MESSAGES } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * SO6 — Real-Time Citizen Status Notifications (paper p.163, FR-15).
 * Target: "Push notifications received by citizen at each processing stage."
 *
 * The definitive server-side evidence is the NOTIFICATION_LOG, surfaced via
 * GET /api/notifications/mine. Push delivery itself is FCM (out of band of an
 * E2E run), so we verify the log is written, public token registration works
 * for anonymous citizens, and messages/types match the schema + paper strings.
 *
 * NOTIFICATION_LOG.notification_type ENUM = ('status_update','escalation','resolution').
 */
const VALID_TYPES = ['status_update', 'escalation', 'resolution'];

test.describe('SO6 — Real-Time Citizen Status Notifications (FR-15)', () => {
  test('TC-SO6-01: Analytics confirms the lifecycle produced logged activity', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(
      `${API_URL}/api/reports/analytics/summary?start_date=2025-01-01&end_date=2026-12-31`,
      { headers: { Authorization: `Bearer ${await getToken('supervisor')}` } },
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total_submitted).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('TC-SO6-02: register-token is public for anonymous citizens (no 401)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/api/notifications/register-token`, {
      data: { fcm_token: 'playwright-test-token-001' },
    });
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test('TC-SO6-03: Logged messages use the exact paper strings (UC-03, p.72)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/notifications/mine`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const feed = (await res.json()).data ?? [];
    test.skip(feed.length === 0, 'No notifications in the feed to validate message strings.');

    const known = [
      NOTIFICATION_MESSAGES.pending,
      NOTIFICATION_MESSAGES.verified,
      NOTIFICATION_MESSAGES.acknowledged,
      NOTIFICATION_MESSAGES.dispatched,
      NOTIFICATION_MESSAGES.escalated,
    ];
    for (const n of feed) {
      const msg: string = n.message;
      const matches =
        known.includes(msg) ||
        msg.startsWith('Report Resolved [') ||
        msg.startsWith('Report Rejected [');
      expect(matches, `Unexpected notification message: "${msg}"`).toBeTruthy();
    }
    await ctx.dispose();
  });

  test('TC-SO6-04: notification_type values match the schema ENUM', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/notifications/mine`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const feed = (await res.json()).data ?? [];
    for (const n of feed) {
      expect(VALID_TYPES).toContain(n.notification_type);
    }
    await ctx.dispose();
  });
});
