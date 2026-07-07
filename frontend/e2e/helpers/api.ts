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

// Submit a report via the public (anonymous) endpoint. Returns the full
// submission response body. Callers only need to provide an APIRequestContext;
// photo_url defaults to a known test URL so setup code stays brief.
export async function submitReportViaAPI(
  ctx: APIRequestContext,
  overrides: { photo_url?: string; street_id?: number; violation_type?: string } = {},
): Promise<{ report_id: number; access_token: string; anonymous_alias: string }> {
  const res = await ctx.post(`${API_URL}/api/reports`, {
    data: {
      photo_url:      overrides.photo_url      ?? 'gs://parkwatch-test/placeholder.jpg',
      street_id:      overrides.street_id      ?? TEST_STREET_ID,
      violation_type: overrides.violation_type ?? TEST_VIOLATION,
    },
  });
  if (!res.ok()) {
    throw new Error(`submitReportViaAPI failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
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
