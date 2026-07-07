// Shared Page-Object helpers and API mock factories.
// Each mock helper intercepts **/api/** with page.route — call it before goto().

import { Page, expect } from '@playwright/test';

// Minimal 1×1 JPEG used for all upload stubs (avoids real GCS round-trips).
export const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////' +
  'wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEG' +
  'E1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
  'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEB' +
  'AQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNO' +
  'El8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tb' +
  'a3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64',
);

// ─── Mock data ──────────────────────────────────────────────────────────────

export const MOCK_STREETS = [
  { street_id: 1, street_name: 'Arellano Avenue', barangay_id: 726, barangay_name: 'Barangay 726' },
  { street_id: 2, street_name: 'Remedios Street',  barangay_id: 727, barangay_name: 'Barangay 727' },
];

export const MOCK_VIOLATION_TYPES = [
  { violation_type: 'Parked on Sidewalk' },
  { violation_type: 'Double Parking' },
];

export const MOCK_REPORT = {
  report_id: 9999,
  access_token: 'mock-access-token',
  anonymous_alias: 'Reporter #4821',
};

export const MOCK_DUP = {
  is_duplicate: true,
  report_id: 1111,
  street_name: 'Arellano Avenue',
  minutes_ago: 15,
  plate: 'ABC 1234',
};

export const MOCK_PENDING_REPORT = {
  report_id: 42,
  status: 'pending',
  anonymous_alias: 'Reporter #0042',
  plate: 'ABC 1234',
  plate_type: 'regular',
  violation_type: 'Parked on Sidewalk',
  street_name: 'Arellano Avenue',
  barangay_name: 'Barangay 726',
  photo_url: 'https://example.com/photo.jpg',
  submitted_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  is_escalated: false,
};

export const MOCK_VERIFIED_REPORT = {
  ...MOCK_PENDING_REPORT,
  report_id: 43,
  status: 'verified',
  verified_at: new Date().toISOString(),
};

export const MOCK_STREET_WITH_RULES = {
  street_id: 1,
  street_name: 'Arellano Avenue',
  barangay_id: 726,
  barangay_name: 'Barangay 726',
  is_active: true,
  rules: [
    {
      rule_id: 10,
      violation_type: 'Parked on Sidewalk',
      description: 'Vehicle parked on a pedestrian sidewalk, obstructing pedestrian flow.',
      ordinance: 'R.A. No. 4136, Sec. 46; MMC Res. No. 23-02, S. 2023',
      is_active: true,
    },
    {
      rule_id: 11,
      violation_type: 'Double Parking',
      description: 'Vehicle parked on the roadway side of another vehicle already stopped.',
      ordinance: 'R.A. No. 4136, Sec. 46(g); MMC Res. No. 23-02, S. 2023',
      is_active: false,
    },
  ],
};

// ─── Citizen API mock ────────────────────────────────────────────────────────

type CitizenApiOverrides = Partial<{
  streets: unknown;
  violationTypes: unknown;
  ocr: unknown;
  penaltyPreview: unknown;
  checkDuplicate: unknown;
  createReport: unknown;
}>;

/**
 * Registers page.route stubs for every citizen-facing API endpoint.
 * Pass overrides to replace individual endpoint responses for specific tests.
 */
export async function mockCitizenApi(page: Page, overrides: CitizenApiOverrides = {}) {
  await page.route('**/api/**', async (route) => {
    const url    = route.request().url();
    const method = route.request().method();
    const json   = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      });

    if (url.includes('/api/streets/') && url.includes('/violation-types')) {
      return json(overrides.violationTypes ?? MOCK_VIOLATION_TYPES);
    }
    if (url.match(/\/api\/streets(\?|$)/)) {
      return json(overrides.streets ?? MOCK_STREETS);
    }
    if (url.includes('/api/upload/photo') && method === 'POST') {
      return json({ photo_url: 'gs://parkwatch-mock/plate.jpg' });
    }
    if (url.includes('/api/reports/ocr')) {
      return json(overrides.ocr ?? { extracted_plate: 'ABC 1234', confidence_score: 97.5 });
    }
    if (url.includes('/api/reports/penalty-preview')) {
      return json(overrides.penaltyPreview ?? { penalty_tier: { tier_name: '1st Offense', fine_amount: 0 } });
    }
    if (url.includes('/api/reports/check-duplicate')) {
      return json(overrides.checkDuplicate ?? { is_duplicate: false });
    }
    if (url.match(/\/api\/reports(\?|$)/) && method === 'POST') {
      return json(overrides.createReport ?? MOCK_REPORT);
    }
    if (url.includes('/api/notifications/register-token')) {
      return json({});
    }
    return route.continue();
  });
}

// ─── Wizard navigation helpers ───────────────────────────────────────────────

/** Brings the citizen wizard to Step 2 (OCR result card + location selectors visible). */
export async function wizardToStep2(page: Page) {
  await page.goto('/citizen/report');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'plate.jpg',
    mimeType: 'image/jpeg',
    buffer: SMALL_JPEG,
  });
  await page.getByRole('button', { name: /Next/i }).click();
  await expect(page.getByText('OCR Extracted Plate')).toBeVisible({ timeout: 8000 });
}

/** Brings the wizard all the way to Step 3 (Additional Photos / Review visible). */
export async function wizardToStep3(page: Page) {
  await wizardToStep2(page);
  // Select barangay (bottom sheet)
  await page.getByRole('button', { name: /Select barangay/i }).click();
  await page.getByText('Barangay 726').click();
  // Select street (bottom sheet)
  await page.getByRole('button', { name: /Select a street/i }).click();
  await page.getByText('Arellano Avenue').click();
  // Select violation type (bottom sheet)
  await page.getByRole('button', { name: /Select violation type/i }).click();
  await page.getByText('Parked on Sidewalk').click();
  // Advance
  await page.getByRole('button', { name: /Next/i }).click();
  await expect(page.getByText('Additional Photos')).toBeVisible({ timeout: 8000 });
}
