import { APIRequestContext, request as globalRequest } from '@playwright/test';
import { API_URL, TEST_STREET_ID, TEST_VIOLATION } from './testData';
import { apiLogin } from './auth';

/**
 * Direct API helpers for test setup. Hit the backend at API_URL (not through
 * the Vite proxy) so they work regardless of frontend server state.
 *
 * Callers pass the Playwright `request` fixture as the first argument —
 * this keeps the request inside the same Playwright worker context and
 * benefits from shared authentication caching in auth.ts.
 */

// A placeholder object path in the configured bucket (GCS_BUCKET_NAME rejects
// foreign buckets). /api/reports/confirm never runs OCR against it — the
// plate comes from manual_plate_input below — so the object doesn't need to
// exist or contain a legible plate.
const FIXTURE_PHOTO_URL = 'gs://parkwatch-evidence-capstone/placeholder.jpg';

// The backend's duplicate check keys on (plate, street_id) within a 24h
// rolling window (DUPLICATE_DETECTION_WINDOW_MINUTES) and isn't scoped to
// this test run, so a fixed plate would collide across repeated suite runs.
// A counter-suffixed plate keeps every call unique instead.
let plateCounter = 0;
const uniqueTestPlate = () => {
  plateCounter += 1;
  const suffix = (Date.now() % 10000 + plateCounter).toString().padStart(4, '0').slice(-4);
  return `TST ${suffix}`;
};

// Submit a report via the public (anonymous) endpoint, using /api/reports/confirm
// so a manually-supplied plate is stored directly instead of relying on real
// Cloud Vision OCR (slow, and would need a fixture photo with a legible plate).
// Returns the full submission response body. Callers only need to provide an
// APIRequestContext; photo_url/street_id/violation_type all have test defaults.
export async function submitReportViaAPI(
  ctx: APIRequestContext,
  overrides: { photo_url?: string; street_id?: number; violation_type?: string; plate?: string } = {},
): Promise<{ report_id: number; access_token: string; anonymous_alias: string }> {
  const res = await ctx.post(`${API_URL}/api/reports/confirm`, {
    data: {
      photo_url:          overrides.photo_url      ?? FIXTURE_PHOTO_URL,
      street_id:          overrides.street_id       ?? TEST_STREET_ID,
      violation_type:     overrides.violation_type  ?? TEST_VIOLATION,
      manual_plate_input: overrides.plate           ?? uniqueTestPlate(),
    },
  });
  const body = await res.json();
  if (!res.ok() || !body?.data?.report_id) {
    throw new Error(`submitReportViaAPI failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body.data;
}

// Approve (verify) a pending report using the barangay official test account.
// Uses the token cache in auth.ts so it never exceeds the 20-login rate limit.
export async function approveReportViaAPI(ctx: APIRequestContext, reportId: number) {
  const { token } = await apiLogin('barangay', ctx);
  const res = await ctx.patch(`${API_URL}/api/reports/${reportId}/verify`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { action: 'approve' },
  });
  if (!res.ok()) {
    throw new Error(`approveReportViaAPI failed for report ${reportId} (${res.status()}): ${await res.text()}`);
  }
}

// Reports are an immutable audit trail — no delete endpoint exists. Log
// any test-created report_id so it can be manually removed if needed.
export async function noteReportForCleanup(reportId: number) {
  // eslint-disable-next-line no-console
  console.log(`[Test cleanup] report_id=${reportId} — remove via DB if needed.`);
}
