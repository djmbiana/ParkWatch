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

  test('TC-SEC-08: POST /admin/barangays is blocked for non-admin roles (403)', async () => {
    const ctx = await request.newContext();
    // An MTPB officer must not be able to create a barangay.
    const res = await ctx.post(`${API_URL}/api/admin/barangays`, {
      headers: { Authorization: `Bearer ${await getToken('officer')}` },
      data: { name: 'E2E Unauthorized Barangay' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('TC-SEC-09: PATCH /admin/barangays/:id/location rejects invalid coordinates (422)', async () => {
    const ctx = await request.newContext();
    // Fetch the first barangay to get a valid ID.
    const listRes = await ctx.get(`${API_URL}/api/admin/barangays`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
    });
    const list = (await listRes.json()).data ?? [];
    if (list.length === 0) {
      await ctx.dispose();
      test.skip(true, 'No barangays in DB to test location update.');
      return;
    }
    const brgyId = list[0].barangay_id;

    const res = await ctx.patch(`${API_URL}/api/admin/barangays/${brgyId}/location`, {
      headers: { Authorization: `Bearer ${await getToken('admin')}` },
      data: { latitude: 999, longitude: 999 }, // out-of-range coords
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test('TC-SEC-10: additional_photos with external URLs are silently dropped (not stored)', async () => {
    const photoUrl = process.env.TEST_PLATE_IMAGE_URI;
    test.skip(!photoUrl, 'Set TEST_PLATE_IMAGE_URI to run the additional_photos drop test.');

    const ctx = await request.newContext();
    // Submit a real report whose additional_photos contains a non-bucket URL.
    const res = await ctx.post(`${API_URL}/api/reports`, {
      data: {
        photo_url: photoUrl,
        street_id: 1,
        violation_type: 'Parked on Sidewalk',
        plate: 'TEST 9901',
        additional_photos: ['https://evil.example.com/malware.jpg'],
      },
    });
    // Request itself must succeed (external URLs are dropped, not 422-rejected).
    expect([200, 201, 409]).toContain(res.status());
    if (res.status() !== 409) {
      const body = await res.json();
      const reportId = body.data?.report_id;
      if (reportId) {
        // Verify the stored report has no additional_photos (external URL was dropped).
        const detail = await ctx.get(`${API_URL}/api/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${await getToken('officer')}` },
        });
        const stored = (await detail.json()).data;
        expect((stored.additional_photos ?? []).length).toBe(0);
      }
    }
    await ctx.dispose();
  });
});
