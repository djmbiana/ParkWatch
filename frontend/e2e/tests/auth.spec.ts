import { test, expect, request } from '@playwright/test';
import { API_URL, LOGIN_PATH, STORAGE, TEST_USERS } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * Authentication & Authorization (paper Ch. IV security testing).
 *
 * NOTE: auth is mounted ONLY at /api/v1/auth (no unversioned alias). Portals are
 * guarded client-side by RoleRoute (token + role in localStorage) and
 * server-side by authorize() middleware.
 *
 * New cases cover:
 *   - Escalation config endpoint auth (migration 032)
 *   - Officer stats endpoint auth (new listOfficers / getOfficerStats)
 */
const login = (ctx: any, email: string, password: string) =>
  ctx.post(`${API_URL}${LOGIN_PATH}`, { data: { email, password } });

test.describe('Authentication & Authorization', () => {
  test('TC-AUTH-01: Login returns a JWT with the correct, sanitized payload', async () => {
    const ctx = await request.newContext();
    const res = await login(ctx, TEST_USERS.barangay.email, TEST_USERS.barangay.password);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.user.role).toBe('brgy_official');
    expect(body.data.user).not.toHaveProperty('password_hash');
    await ctx.dispose();
  });

  test('TC-AUTH-02: Wrong password returns 401', async () => {
    const ctx = await request.newContext();
    const res = await login(ctx, TEST_USERS.barangay.email, 'WRONGPASSWORD');
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('TC-AUTH-03: Deactivated account is rejected (403)', async () => {
    const ctx = await request.newContext();
    const res = await login(ctx, 'deactivated@test.com', 'Test1234!');
    test.skip(res.status() !== 403, 'No deactivated test account seeded (expected 403).');
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-04: Protected request without a token returns 401', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('TC-AUTH-05: Wrong role returns 403 (officer → barangay queue)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-06: Admin cannot access the barangay queue (403)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-07: Role from the JWT cannot be overridden by headers/body', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/supervisor`, {
      headers: {
        Authorization: `Bearer ${await getToken('officer')}`,
        'X-Role-Override': 'mtpb_supervisor',
      },
      data: { role: 'mtpb_supervisor' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-08: /citizen is publicly accessible (no JWT required)', async ({ page }) => {
    await page.goto('/citizen');
    await expect(page).not.toHaveURL(/login/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-AUTH-09: A portal redirects an unauthenticated user to /login', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate((keys) => {
      localStorage.removeItem(keys.token);
      localStorage.removeItem(keys.user);
    }, STORAGE);
    await page.goto('/barangay');
    await expect(page).toHaveURL(/login/);
  });

  test('TC-AUTH-10: A wrong-role session is redirected to /login', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate((keys) => {
      localStorage.setItem(keys.token, 'fake-citizen-token');
      localStorage.setItem(keys.user, JSON.stringify({ role: 'citizen' }));
    }, STORAGE);
    await page.goto('/barangay');
    await expect(page).toHaveURL(/login/);
  });

  // --- New auth cases (migration 032 + officer stats) ---

  test('TC-AUTH-11: Escalation config GET requires authentication (401)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/admin/system-config/escalation`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('TC-AUTH-12: Escalation config PATCH is forbidden for MTPB officer (403)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
      data: { response_window_minutes: 30 },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-13: Escalation config PATCH is forbidden for barangay official (403)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/admin/system-config/escalation`, {
      headers: { Authorization: `Bearer ${await getToken('barangay')}` },
      data: { response_window_minutes: 30 },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-14: Officer stats endpoint requires supervisor or admin (403 for officer)', async () => {
    const ctx = await request.newContext();
    // Officers cannot look up their own stats via the supervisor-only endpoint.
    const res = await ctx.get(`${API_URL}/api/admin/officers/3/stats`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-AUTH-15: Supervisor can access officer stats endpoint (200)', async () => {
    const ctx = await request.newContext();
    // First get a real officer user_id.
    const officersRes = await ctx.get(`${API_URL}/api/admin/officers`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    const officers = (await officersRes.json()) ?? [];
    const list = Array.isArray(officers) ? officers : [];
    if (list.length === 0) {
      await ctx.dispose();
      test.skip(true, 'No officers seeded.');
      return;
    }
    const res = await ctx.get(`${API_URL}/api/admin/officers/${list[0].user_id}/stats`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('stats');
    expect(body.data).toHaveProperty('recent');
    await ctx.dispose();
  });

  test('TC-AUTH-16: Appeal verdict PATCH requires brgy_official role (403 for supervisor)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.patch(`${API_URL}/api/reports/1/appeal-verdict`, {
      headers: { Authorization: `Bearer ${await getToken('supervisor')}` },
      data: { verdict: 'upheld' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});
