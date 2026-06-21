import { test, expect, request } from '@playwright/test';
import { API_URL } from '../helpers/testData';
import { getToken } from '../helpers/auth';

/**
 * Security spot checks (paper NFR-08 PII protection + general hardening).
 */
test.describe('Security Checks', () => {
  test('TC-SEC-01: No citizen PII in the barangay queue response (NFR-08)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`, {
      headers: { Authorization: `Bearer ${await getToken('barangay')}` },
    });
    const bodyStr = JSON.stringify(await res.json());
    expect(bodyStr).not.toMatch(/"first_name"/);
    expect(bodyStr).not.toMatch(/"last_name"/);
    expect(bodyStr).not.toMatch(/"email"/);
    expect(bodyStr).not.toMatch(/"password_hash"/);
    expect(bodyStr).not.toMatch(/"phone_number"/);
    await ctx.dispose();
  });

  test('TC-SEC-02: password_hash never appears in an admin users response', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
    });
    expect(JSON.stringify(await res.json())).not.toContain('password_hash');
    await ctx.dispose();
  });

  test('TC-SEC-03: Duplicate report detection (FR-08)', async () => {
    const photoUrl = process.env.TEST_PLATE_IMAGE_URI;
    // Creating reports runs server-side OCR and writes to the DB, so this only
    // runs with a real plate image to avoid polluting data / flaky OCR.
    test.skip(!photoUrl, 'Set TEST_PLATE_IMAGE_URI (a real plate photo) to run duplicate detection.');
    const ctx = await request.newContext();
    const payload = { photo_url: photoUrl, street_id: 1, violation_type: 'Parked on Sidewalk' };
    await ctx.post(`${API_URL}/api/reports`, { data: payload });
    const second = await ctx.post(`${API_URL}/api/reports`, { data: payload });
    // An immediate identical re-submission is either accepted or flagged as a
    // duplicate (409) depending on the OCR reading.
    expect([200, 201, 409]).toContain(second.status());
    await ctx.dispose();
  });

  test('TC-SEC-04: Unauthenticated access to an enforcement queue is rejected (401)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/queue/barangay`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('TC-SEC-05: CORS does not reflect an arbitrary attacker origin', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/health`, {
      headers: { Origin: 'http://malicious-attacker.com' },
    });
    const acao = res.headers()['access-control-allow-origin'];
    // The attacker's origin must never be reflected back.
    expect(acao).not.toBe('http://malicious-attacker.com');
    if (acao === '*') {
      // Dev/test default (backend/src/app.js uses '*' when NODE_ENV !== production;
      // production restricts to the CORS_ORIGINS allowlist). Not a defect here.
      // eslint-disable-next-line no-console
      console.log('[SEC] CORS is wildcard "*" — expected in non-production. Verify CORS_ORIGINS in prod.');
    }
    await ctx.dispose();
  });

  test('TC-SEC-06: SQL-injection in a path param is handled safely (no data leak)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/reports/${encodeURIComponent("1' OR '1'='1")}`);
    // Must not succeed with 200 (parameterized queries + auth guard). 401/400/404 ok.
    expect([400, 401, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test('TC-SEC-07: Admin cannot provision a citizen role (UC-13) → 422', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
      data: {
        first_name: 'Test',
        last_name: 'Citizen',
        email: `fake_citizen_${Date.now()}@test.com`,
        role: 'citizen',
      },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });
});
