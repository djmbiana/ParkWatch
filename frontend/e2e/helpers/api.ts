import { request } from '@playwright/test';
import { API_URL, TEST_STREET_ID, TEST_VIOLATION } from './testData';

/**
 * Direct API helpers for test setup/teardown. These hit the backend at
 * API_URL (not through the Vite proxy) so they work even when only the
 * frontend dev server is managed by Playwright.
 */

// Submit a report directly via the public (anonymous) endpoint. Used to set up
// state for queue/lifecycle tests. Returns the created report's identity.
export async function submitReportViaAPI(photoUrl: string): Promise<{
  report_id: number;
  access_token: string;
  anonymous_alias: string;
}> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API_URL}/api/reports`, {
    data: {
      photo_url: photoUrl,
      street_id: TEST_STREET_ID,
      violation_type: TEST_VIOLATION,
    },
  });
  const body = await res.json();
  await ctx.dispose();
  return body.data;
}

// Barangay approval of a pending report (verify → approve), for setup.
export async function approveReportViaAPI(reportId: number, token: string) {
  const ctx = await request.newContext();
  await ctx.patch(`${API_URL}/api/reports/${reportId}/verify`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { action: 'approve' },
  });
  await ctx.dispose();
}

// There is no destructive cleanup endpoint (reports are an audit trail). Test
// reports created during a run are logged for manual / DB cleanup.
export async function noteReportForCleanup(reportId: number) {
  // eslint-disable-next-line no-console
  console.log(`[Cleanup] Report ${reportId} created during test — remove via DB if needed.`);
}
