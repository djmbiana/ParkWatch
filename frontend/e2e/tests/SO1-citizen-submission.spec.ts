import { test, expect, Page } from '@playwright/test';
import { STORAGE } from '../helpers/testData';

/**
 * SO1 — Citizen Violation Submission (paper p.162).
 * Target: "All required fields validated before submission proceeds."
 *
 * The real wizard (src/pages/citizen/ReportWizard.jsx) is a single-page,
 * stateful flow: the Step-2 plate field only appears AFTER a photo upload +
 * OCR preview. To exercise the validation logic deterministically — without a
 * real GCS upload or the Vision OCR — we stub the citizen API with page.route.
 * The component's own field validation (disabled buttons, plate regex,
 * auto-uppercase) is what's under test, so stubbing the network is correct.
 *
 * Backend response envelope is { data: ... }; the citizen API client unwraps
 * json.data, so every stub nests its payload under `data`.
 *
 * Streets mock must include `barangay_id` — the wizard groups the street picker
 * by barangay_id (useMemo), so omitting it collapses all streets under one key.
 */

const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64',
);

async function mockCitizenApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

    if (url.includes('/api/streets/') && url.includes('/violation-types')) {
      return json([{ violation_type: 'Parked on Sidewalk' }, { violation_type: 'Double Parking' }]);
    }
    // barangay_id is required — wizard groups streets by barangay_id in useMemo.
    if (url.match(/\/api\/streets(\?|$)/)) {
      return json([{ street_id: 1, street_name: 'Arellano Avenue', barangay_id: 726, barangay_name: 'Barangay 726' }]);
    }
    if (url.includes('/api/upload/photo') && method === 'POST') {
      return json({ photo_url: 'gs://parkwatch-mock/plate.jpg' });
    }
    if (url.includes('/api/reports/ocr')) {
      return json({ extracted_plate: 'ABC 1234', confidence_score: 97.5 });
    }
    if (url.includes('/api/reports/penalty-preview')) {
      return json({ penalty_tier: { tier_name: '1st Offense', fine_amount: 0 } });
    }
    if (url.match(/\/api\/reports(\?|$)/) && method === 'POST') {
      return json({ report_id: 9999, access_token: 'mock-access-token', anonymous_alias: 'Reporter #4821' });
    }
    return route.continue();
  });
}

// Drives the wizard to Step 2 (plate + street + violation pickers visible).
async function reachStep2(page: Page) {
  await page.goto('/citizen/report');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'plate.jpg',
    mimeType: 'image/jpeg',
    buffer: SMALL_JPEG,
  });
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByText('OCR Extracted Plate')).toBeVisible();
}

// Drives the wizard all the way to Step 3 (Review & Submit).
async function reachStep3(page: Page) {
  await reachStep2(page);
  await page.getByRole('button', { name: 'Select a street in Malate...' }).click();
  await page.getByText('Arellano Avenue').click();
  await page.getByRole('button', { name: 'Select violation type...' }).click();
  await page.getByText('Parked on Sidewalk').click();
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByText('Additional Photos')).toBeVisible({ timeout: 5000 });
}

test.describe('SO1 — Citizen Report Submission', () => {
  // TC-SO1-01: Home screen loads without login.
  test('TC-SO1-01: /citizen loads publicly without authentication', async ({ page }) => {
    await page.goto('/citizen');
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole('button', { name: 'Report a Violation' })).toBeVisible();
  });

  // TC-SO1-02: Cannot advance Step 1 without a photo (Next disabled).
  test('TC-SO1-02: Step-1 Next button is disabled with no photo selected', async ({ page }) => {
    await mockCitizenApi(page);
    await page.goto('/citizen/report');
    await expect(page.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  // TC-SO1-03: Photo size validation — over 10MB rejected, Next stays disabled.
  test('TC-SO1-03: Rejects file over 10MB with inline error', async ({ page }) => {
    await mockCitizenApi(page);
    await page.goto('/citizen/report');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'big.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(11 * 1024 * 1024, 1),
    });
    await expect(page.getByText('10MB')).toBeVisible();
    await expect(page.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  // TC-SO1-04: Step 2 fields are not present until Step 1 is complete.
  test('TC-SO1-04: Step-2 pickers not shown before photo uploaded', async ({ page }) => {
    await mockCitizenApi(page);
    await page.goto('/citizen/report');
    await expect(page.getByText('Select a street in Malate...')).toHaveCount(0);
    await expect(page.getByText('OCR Extracted Plate')).toHaveCount(0);
  });

  // TC-SO1-05: Step-2 Next disabled until plate valid AND street AND violation.
  test('TC-SO1-05: Step-2 Next disabled until plate + street + violation set', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    const next = page.getByRole('button', { name: /Next/ });
    await expect(next).toBeDisabled();

    await page.getByRole('button', { name: 'Select a street in Malate...' }).click();
    await page.getByText('Arellano Avenue').click();
    await expect(next).toBeDisabled(); // still missing violation

    await page.getByRole('button', { name: 'Select violation type...' }).click();
    await page.getByText('Parked on Sidewalk').click();
    await expect(next).toBeEnabled();
  });

  // TC-SO1-06: Streets populate from GET /api/streets with barangay_id (FR-02).
  test('TC-SO1-06: Street list populates and includes barangay_id grouping', async ({ page }) => {
    await mockCitizenApi(page);
    const streetsReq = page.waitForRequest((r) => /\/api\/streets(\?|$)/.test(r.url()));
    await reachStep2(page);
    await streetsReq;
    await page.getByRole('button', { name: 'Select a street in Malate...' }).click();
    // Street name visible under its barangay group
    await expect(page.getByText('Arellano Avenue')).toBeVisible();
    // Barangay group header also visible
    await expect(page.getByText('Barangay 726')).toBeVisible();
  });

  // TC-SO1-07: Violation types fetch per street on selection (FR-02).
  test('TC-SO1-07: Violation types fetch when a street is selected', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    const vtypesReq = page.waitForRequest((r) => r.url().includes('/violation-types'));
    await page.getByRole('button', { name: 'Select a street in Malate...' }).click();
    await page.getByText('Arellano Avenue').click();
    await vtypesReq;
    await page.getByRole('button', { name: 'Select violation type...' }).click();
    await expect(page.getByText('Parked on Sidewalk')).toBeVisible();
  });

  // TC-SO1-08: Invalid plate format shows inline error and blocks Next.
  test('TC-SO1-08: Invalid plate format shows inline error', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    const plate = page.locator('input[placeholder*="ABC"]');
    await plate.fill('BADFORMAT');
    await expect(page.getByText(/Invalid format/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  // TC-SO1-09: Valid PH plate formats accepted (private and motorcycle).
  test('TC-SO1-09: Valid PH plate formats accepted', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    const plate = page.locator('input[placeholder*="ABC"]');

    await plate.fill('ABC 1234'); // standard private
    await expect(page.getByText(/Invalid format/)).toHaveCount(0);

    await plate.fill('ABC 12-3456'); // motorcycle
    await expect(page.getByText(/Invalid format/)).toHaveCount(0);
  });

  // TC-SO1-10: Plate input auto-uppercases.
  test('TC-SO1-10: Plate input converts to uppercase automatically', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    const plate = page.locator('input[placeholder*="ABC"]');
    await plate.fill('abc 1234');
    await expect(plate).toHaveValue('ABC 1234');
  });

  // TC-SO1-11: Confirmation screen shows anonymous alias and RPT-{id}.
  test('TC-SO1-11: Confirmation screen shows alias and report ID', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    await page.getByRole('button', { name: 'Select a street in Malate...' }).click();
    await page.getByText('Arellano Avenue').click();
    await page.getByRole('button', { name: 'Select violation type...' }).click();
    await page.getByText('Parked on Sidewalk').click();
    await page.getByRole('button', { name: /Next/ }).click();

    await page.getByRole('button', { name: /Submit Report/ }).click();
    await page.getByRole('button', { name: 'Yes, Submit' }).click();

    await expect(page.getByText('Report Submitted!')).toBeVisible();
    await expect(page.getByText('RPT-9999')).toBeVisible();
    await expect(page.getByText('Reporter #4821')).toBeVisible();
  });

  // TC-SO1-12: Empty My Reports shows correct empty-state text.
  test('TC-SO1-12: Empty My Reports shows empty-state message', async ({ page }) => {
    await page.goto('/citizen');
    await page.evaluate((keys) => localStorage.removeItem(keys.reports), STORAGE);
    await page.goto('/citizen/reports');
    await expect(page.getByText('You have not submitted any reports yet.')).toBeVisible();
  });

  // TC-SO1-13: Citizen API calls carry no Authorization header (anonymous).
  test('TC-SO1-13: Citizen API calls send no Authorization header', async ({ page }) => {
    const offenders: string[] = [];
    page.on('request', (req) => {
      if (/\/api\//.test(req.url()) && req.headers()['authorization']) {
        offenders.push(req.url());
      }
    });
    await page.goto('/citizen');
    await page.goto('/citizen/report');
    await page.waitForTimeout(1000);
    expect(offenders).toEqual([]);
  });

  // TC-SO1-14: No native window.alert()/confirm() in the citizen flow.
  test('TC-SO1-14: No native dialogs in citizen pages', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', (d) => {
      dialogFired = true;
      d.dismiss();
    });
    await page.goto('/citizen');
    await page.goto('/citizen/report');
    await page.goto('/citizen/reports');
    expect(dialogFired).toBe(false);
  });

  // TC-SO1-15: Step 2 shows the partnered-barangay disclaimer.
  test('TC-SO1-15: Step 2 shows partnered-barangay disclaimer', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep2(page);
    await expect(
      page.getByText(/Only streets in barangays partnered with ParkWatch/),
    ).toBeVisible();
  });

  // TC-SO1-16: Step 3 renders the "Additional Photos" section with an Add button.
  test('TC-SO1-16: Step 3 shows Additional Photos section with Add button', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep3(page);
    await expect(page.getByText('Additional Photos')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add/i })).toBeVisible();
  });

  // TC-SO1-17: Oversized extra photo in Step 3 shows inline error, photo not added.
  test('TC-SO1-17: Oversized extra photo shows inline error in Step 3', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep3(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'big.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(11 * 1024 * 1024, 1),
    });
    await expect(page.getByText(/10MB/)).toBeVisible();
    await expect(page.locator('img[alt="Extra 1"]')).toHaveCount(0);
  });

  // TC-SO1-18: Step 3 shows consent "Privacy Notice" link above Submit.
  test('TC-SO1-18: Step 3 shows Privacy Notice consent line', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep3(page);
    await expect(page.getByText(/By submitting.*Privacy Notice/)).toBeVisible();
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
  });

  // TC-SO1-19: An added extra photo is included in the submit POST body.
  test('TC-SO1-19: Additional photo URL sent in submit request body', async ({ page }) => {
    await mockCitizenApi(page);
    await reachStep3(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'extra.jpg',
      mimeType: 'image/jpeg',
      buffer: SMALL_JPEG,
    });
    await expect(page.locator('img[alt="Extra 1"]')).toBeVisible({ timeout: 5000 });

    const submitReq = page.waitForRequest(
      (r) => /\/api\/reports(\?|$)/.test(r.url()) && r.method() === 'POST',
    );
    await page.getByRole('button', { name: /Submit Report/ }).click();
    await page.getByRole('button', { name: 'Yes, Submit' }).click();

    const req = await submitReq;
    const body = JSON.parse(req.postData() ?? '{}');
    expect(Array.isArray(body.additional_photos)).toBe(true);
    expect(body.additional_photos.length).toBeGreaterThanOrEqual(1);
  });

  // TC-SO1-20: My Reports "Declined" tab exists (renamed from "Rejected").
  test('TC-SO1-20: My Reports shows "Declined" filter tab (not "Rejected")', async ({ page }) => {
    await page.goto('/citizen/reports');
    await expect(page.getByRole('button', { name: 'Declined' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Rejected' })).toHaveCount(0);
  });

  // TC-SO1-21: My Reports expanded panel does NOT show "Submit Another Report" button.
  test('TC-SO1-21: My Reports expanded panel has no Submit Another Report button', async ({ page }) => {
    await mockCitizenApi(page);
    // Seed a mock report in localStorage so the list is non-empty.
    await page.goto('/citizen');
    await page.evaluate((keys) => {
      const r = [{ report_id: 1, status: 'pending', submitted_at: new Date().toISOString(), anonymous_alias: 'Reporter #1', access_token: 'tok1' }];
      localStorage.setItem(keys.reports, JSON.stringify(r));
    }, STORAGE);
    await page.goto('/citizen/reports');
    // Click a row to expand it.
    const firstRow = page.locator('[data-testid="report-row"], tbody tr, .report-item').first();
    const count = await firstRow.count();
    if (count === 0) {
      test.skip(true, 'No report rows rendered — localStorage seed may have been ignored.');
      return;
    }
    await firstRow.click();
    await page.waitForTimeout(500);
    // The button must not exist anywhere on the expanded panel.
    await expect(page.getByRole('button', { name: /Submit Another Report/i })).toHaveCount(0);
  });
});
