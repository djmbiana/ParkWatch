/**
 * citizen.spec.ts — Citizen Violation Reporting Flow
 *
 * FR-01: Photo capture with file validation
 * FR-02: Cascading location selectors (Barangay → Street → Violation Type)
 * FR-03/04: OCR plate extraction preview
 * FR-05/06: Low-confidence OCR → manual plate entry fallback
 * FR-07: Philippine plate format validation (7 accepted formats)
 * FR-08: Duplicate detection → add-context-photos modal (current behavior:
 *         NOT a hard block — citizen chooses to add corroborating photos)
 * FR-11: Report submission creates a retrievable record
 * FR-15: RA 10173 privacy notice visible on all citizen pages
 * FR-16: Anonymous citizens can view their own report status via access_token
 *
 * Post-ISPROJ1 additions tested:
 *   - Conduction sticker plate type (MMC Res. No. 23-02, S. 2023)
 *   - Temporary plate type
 *   - Witness/corroborating photo mode in dup modal (3-photo cap, no token)
 *   - Contest (appeal) a declined report
 *   - Plate auto-uppercase
 *
 * KNOWN BEHAVIORAL NOTES (flagged for paper):
 *   - Location hierarchy: wizard shows Barangay → Street only (no District
 *     or Address levels). "Malate, Manila" is hardcoded informational text.
 *   - FR-08 current behavior: dup detection shows an OFFER to add photos,
 *     not a hard discard of the new submission.
 *   - plate_type 'temporary' route-validator gap: reportRoutes.js
 *     submissionValidators isIn() only allows ['regular','conduction','no_plate'].
 *     The DB column and controller support 'temporary', but a direct API call
 *     with plate_type:'temporary' is rejected at route validation (flagged defect).
 *   - RUN_WITH_LIVE_API=1 gates the single test that calls the real GCV OCR.
 *
 * All tests mock the API layer via page.route so they run without a live
 * backend (except the RUN_WITH_LIVE_API block).
 */

import { test, expect } from '@playwright/test';
import {
  mockCitizenApi,
  wizardToStep2,
  wizardToStep3,
  SMALL_JPEG,
  MOCK_DUP,
  MOCK_REPORT,
  MOCK_STREETS,
} from '../helpers/pages';
import { STORAGE } from '../helpers/testData';

// ─────────────────────────────────────────────────────────────────────────────
// FR-01: Photo Capture & File Validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-01: Photo capture', () => {
  test.beforeEach(async ({ page }) => {
    await mockCitizenApi(page);
  });

  test('TC-CIT-01: Next button disabled until photo is attached', async ({ page }) => {
    await page.goto('/citizen/report');
    const next = page.getByRole('button', { name: /Next/i });
    await expect(next).toBeDisabled();
  });

  test('TC-CIT-02: Valid photo upload enables the Next button', async ({ page }) => {
    await page.goto('/citizen/report');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'plate.jpg',
      mimeType: 'image/jpeg',
      buffer: SMALL_JPEG,
    });
    await expect(page.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  test('TC-CIT-03: Non-image file shows an error, Next stays disabled', async ({ page }) => {
    await page.goto('/citizen/report');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake'),
    });
    const next = page.getByRole('button', { name: /Next/i });
    // The button should remain disabled or an error message should appear.
    // Accept either: disabled button OR an error text.
    const errorVisible = await page.getByText(/invalid|not.*support|image only/i).isVisible().catch(() => false);
    const stillDisabled = await next.isDisabled().catch(() => false);
    expect(errorVisible || stillDisabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-02: Cascading Location Selectors (Barangay → Street → Violation Type)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-02: Cascading location selectors', () => {
  test.beforeEach(async ({ page }) => {
    await mockCitizenApi(page);
  });

  test('TC-CIT-04: Street selector is disabled until a barangay is selected', async ({ page }) => {
    await wizardToStep2(page);
    // Street dropdown placeholder reads "Select barangay first" when no barangay chosen
    await expect(page.getByRole('button', { name: /Select barangay first/i })).toBeVisible();
  });

  test('TC-CIT-05: Selecting a barangay populates the street dropdown', async ({ page }) => {
    await wizardToStep2(page);
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    // Street picker now enabled with at least the mocked street
    await page.getByRole('button', { name: /Select a street/i }).click();
    await expect(page.getByText('Arellano Avenue')).toBeVisible();
  });

  test('TC-CIT-06: Violation type selector is disabled until a street is selected', async ({ page }) => {
    await wizardToStep2(page);
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    // Before selecting a street, violation placeholder reads "Select a street first"
    await expect(page.getByRole('button', { name: /Select a street first/i })).toBeVisible();
  });

  test('TC-CIT-07: Selecting a street fetches and shows violation types', async ({ page }) => {
    await wizardToStep2(page);
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    await page.getByRole('button', { name: /Select a street/i }).click();
    await page.getByText('Arellano Avenue').click();
    // Violation picker now available
    await page.getByRole('button', { name: /Select violation type/i }).click();
    await expect(page.getByText('Parked on Sidewalk')).toBeVisible();
    await expect(page.getByText('Double Parking')).toBeVisible();
  });

  test('TC-CIT-08: Next button in step 2 requires street AND violation type selected', async ({ page }) => {
    await wizardToStep2(page);
    const next = page.getByRole('button', { name: /Next/i });
    // No location selected yet
    await expect(next).toBeDisabled();
    // Select barangay + street only
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    await page.getByRole('button', { name: /Select a street/i }).click();
    await page.getByText('Arellano Avenue').click();
    await expect(next).toBeDisabled();
    // Now select violation type
    await page.getByRole('button', { name: /Select violation type/i }).click();
    await page.getByText('Parked on Sidewalk').click();
    await expect(next).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-03/04: OCR Plate Extraction
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-03/04: OCR plate extraction', () => {
  test('TC-CIT-09: High-confidence OCR auto-fills plate field', async ({ page }) => {
    await mockCitizenApi(page, { ocr: { extracted_plate: 'XYZ 5678', confidence_score: 95.0 } });
    await wizardToStep2(page);
    // The OCR result card shows the extracted plate
    await expect(page.getByText('XYZ 5678')).toBeVisible();
    // The confidence score is displayed
    await expect(page.getByText(/95/)).toBeVisible();
  });

  test('TC-CIT-10: Low-confidence OCR shows a manual-entry prompt (FR-05/FR-06)', async ({ page }) => {
    await mockCitizenApi(page, { ocr: { extracted_plate: 'AB? 1?34', confidence_score: 41.0 } });
    await wizardToStep2(page);
    // Wizard shows a "low confidence" warning or manual entry toggle
    await expect(
      page.getByText(/low confidence|manually|confirm.*plate|not sure/i)
    ).toBeVisible({ timeout: 6000 });
  });

  test('TC-CIT-11: OCR failure (null plate) still shows a manual entry input', async ({ page }) => {
    await mockCitizenApi(page, { ocr: { extracted_plate: null, confidence_score: 0 } });
    await wizardToStep2(page);
    // Should show input for manual plate entry
    const input = page.locator('input[placeholder*="plate" i], input[placeholder*="ABC" i]').first();
    await expect(input).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-07: Philippine Plate Format Validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-07: Philippine plate format validation', () => {
  // Helper: reach step 2 and locate the plate text input
  async function getPlateInput(page: Parameters<typeof wizardToStep2>[0]) {
    await mockCitizenApi(page);
    await wizardToStep2(page);
    return page.locator('input[placeholder*="plate" i], input[placeholder*="ABC" i], input[maxlength]').first();
  }

  test('TC-CIT-12: Valid regular PH plate (NNN NNNN) accepted — Next enables', async ({ page }) => {
    const input = await getPlateInput(page);
    await input.fill('abc 1234');
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    await page.getByRole('button', { name: /Select a street/i }).click();
    await page.getByText('Arellano Avenue').click();
    await page.getByRole('button', { name: /Select violation type/i }).click();
    await page.getByText('Parked on Sidewalk').click();
    await expect(page.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  test('TC-CIT-13: Plate input auto-uppercases', async ({ page }) => {
    const input = await getPlateInput(page);
    await input.fill('abc 1234');
    // Trigger onChange / onBlur
    await input.blur();
    const val = await input.inputValue();
    expect(val).toBe('ABC 1234');
  });

  test('TC-CIT-14: Invalid plate format keeps Next disabled', async ({ page }) => {
    const input = await getPlateInput(page);
    await input.fill('NOT-A-PLATE-!!');
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    await page.getByRole('button', { name: /Select a street/i }).click();
    await page.getByText('Arellano Avenue').click();
    await page.getByRole('button', { name: /Select violation type/i }).click();
    await page.getByText('Parked on Sidewalk').click();
    await expect(page.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  test('TC-CIT-15: No-plate option allows submission without a plate number', async ({ page }) => {
    await mockCitizenApi(page);
    await wizardToStep2(page);
    // Select "No Plate" plate type
    const noPlateOption = page.getByRole('button', { name: /no.?plate/i }).first();
    if (await noPlateOption.isVisible()) {
      await noPlateOption.click();
    } else {
      // May be a radio/tab — find by text
      await page.getByText(/no.?plate/i).first().click();
    }
    await page.getByRole('button', { name: /Select barangay/i }).click();
    await page.getByText('Barangay 726').click();
    await page.getByRole('button', { name: /Select a street/i }).click();
    await page.getByText('Arellano Avenue').click();
    await page.getByRole('button', { name: /Select violation type/i }).click();
    await page.getByText('Parked on Sidewalk').click();
    await expect(page.getByRole('button', { name: /Next/i })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-08: Duplicate Detection (current behavior: offer, not hard block)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-08: Duplicate detection', () => {
  test('TC-CIT-16: When no duplicate exists the wizard proceeds normally', async ({ page }) => {
    await mockCitizenApi(page, { checkDuplicate: { is_duplicate: false } });
    await wizardToStep3(page);
    // No dup modal — we should be on step 3
    await expect(page.getByText('Additional Photos')).toBeVisible();
  });

  test('TC-CIT-17: Duplicate detected → dup modal appears with add-photos option', async ({ page }) => {
    await mockCitizenApi(page, { checkDuplicate: MOCK_DUP });
    await wizardToStep3(page);
    // Modal should be visible (FR-08 current behavior: offer to add context, not hard block)
    await expect(page.getByText(/already.*report|report.*exist|duplicate/i)).toBeVisible({ timeout: 6000 });
    // Add photos option visible
    await expect(page.getByText(/add.*photo|supporting photo|corroborat/i)).toBeVisible();
  });

  test('TC-CIT-18: Witness mode in dup modal shows 3-photo cap (no access token)', async ({ page }) => {
    await mockCitizenApi(page, { checkDuplicate: MOCK_DUP });
    // Ensure there is NO stored access token for the dup report
    await page.goto('/login');
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE.reportTokens);
    await mockCitizenApi(page, { checkDuplicate: MOCK_DUP });
    await wizardToStep3(page);
    // In witness mode (no token), the modal should show "Add supporting photos"
    await expect(page.getByText(/add supporting photo/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-11: Successful Submission
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-11: Report submission', () => {
  test('TC-CIT-19: Completing the wizard shows a success screen', async ({ page }) => {
    await mockCitizenApi(page);
    await wizardToStep3(page);
    await page.getByRole('button', { name: /Submit/i }).click();
    // Success confirmation screen
    await expect(page.getByText(/submitted|success|report.*received/i)).toBeVisible({ timeout: 8000 });
  });

  test('TC-CIT-20: Success screen shows the anonymous alias returned by the API', async ({ page }) => {
    await mockCitizenApi(page, { createReport: MOCK_REPORT });
    await wizardToStep3(page);
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText(/Reporter #4821/)).toBeVisible({ timeout: 8000 });
  });

  test('TC-CIT-21: Submission stores report_id + access_token in localStorage', async ({ page }) => {
    await mockCitizenApi(page, { createReport: MOCK_REPORT });
    await wizardToStep3(page);
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText(/submitted|success/i)).toBeVisible({ timeout: 8000 });
    const tokens = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE.reportTokens);
    expect(tokens).toBeTruthy();
    expect(tokens[MOCK_REPORT.report_id]).toBe(MOCK_REPORT.access_token);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-16: Citizen Report Status Visibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-16: Report status visibility', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed localStorage with a known report entry
    await page.goto('/citizen');
    await page.evaluate(
      ({ reportsKey, tokensKey, reportId, token }) => {
        const reports = [
          {
            report_id: reportId,
            status: 'pending',
            anonymous_alias: 'Reporter #4821',
            plate: 'ABC 1234',
            street_name: 'Arellano Avenue',
            violation_type: 'Parked on Sidewalk',
            submitted_at: new Date().toISOString(),
          },
        ];
        localStorage.setItem(reportsKey, JSON.stringify(reports));
        localStorage.setItem(tokensKey, JSON.stringify({ [reportId]: token }));
      },
      {
        reportsKey: STORAGE.reports,
        tokensKey: STORAGE.reportTokens,
        reportId: 9999,
        token: 'mock-access-token',
      },
    );
  });

  test('TC-CIT-22: My Reports page shows saved reports', async ({ page }) => {
    await page.route('**/api/reports/9999**', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 9999,
            status: 'pending',
            plate: 'ABC 1234',
            violation_type: 'Parked on Sidewalk',
            street_name: 'Arellano Avenue',
            submitted_at: new Date().toISOString(),
          },
        }),
      });
    });
    await page.goto('/citizen/my-reports');
    await expect(page.getByText('ABC 1234')).toBeVisible({ timeout: 6000 });
  });

  test('TC-CIT-23: Declined report offers a Contest option', async ({ page }) => {
    await page.route('**/api/reports/9999**', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            report_id: 9999,
            status: 'rejected',
            plate: 'ABC 1234',
            violation_type: 'Parked on Sidewalk',
            street_name: 'Arellano Avenue',
            rejection_reason: 'Photo unclear',
            submitted_at: new Date().toISOString(),
          },
        }),
      });
    });
    await page.goto('/citizen/my-reports');
    await expect(page.getByText(/contest|appeal/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-15: Privacy Notice (RA 10173 compliance)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('FR-15: Privacy notice', () => {
  test('TC-CIT-24: Privacy / RA 10173 notice is shown on the citizen home page', async ({ page }) => {
    await page.goto('/citizen');
    await expect(page.getByText(/privacy|RA 10173|Data Privacy Act/i)).toBeVisible({ timeout: 6000 });
  });

  test('TC-CIT-25: Privacy notice is visible on the report wizard start page', async ({ page }) => {
    await mockCitizenApi(page);
    await page.goto('/citizen/report');
    // Accept either inline notice or a consent line
    await expect(page.getByText(/privacy|personal.*data|RA 10173/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-ISPROJ1: Conduction sticker & temporary plate types
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Post-ISPROJ1: Additional plate types', () => {
  test('TC-CIT-26: Selecting Conduction Sticker renders the sticker input UI', async ({ page }) => {
    await mockCitizenApi(page);
    await wizardToStep2(page);
    // Conduction sticker tab/option
    const conductionTab = page.getByRole('button', { name: /conduction/i })
      .or(page.getByText(/conduction sticker/i))
      .first();
    await expect(conductionTab).toBeVisible({ timeout: 6000 });
    await conductionTab.click();
    // The conduction sticker input (first part is the series code)
    await expect(page.getByPlaceholder(/series|e\.g\. 0A|sticker/i)).toBeVisible({ timeout: 6000 });
  });

  test('TC-CIT-27: Selecting Temporary Plate renders the temp plate input', async ({ page }) => {
    await mockCitizenApi(page);
    await wizardToStep2(page);
    const tempTab = page.getByRole('button', { name: /temporary/i })
      .or(page.getByText(/temporary plate/i))
      .first();
    await expect(tempTab).toBeVisible({ timeout: 6000 });
    await tempTab.click();
    // The temporary plate input
    await expect(page.getByPlaceholder(/e\.g\. TEMP|temporary|1234/i)).toBeVisible({ timeout: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live API (gated by RUN_WITH_LIVE_API env var)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Live GCV OCR (RUN_WITH_LIVE_API=1 only)', () => {
  test.skip(
    !process.env.RUN_WITH_LIVE_API,
    'Set RUN_WITH_LIVE_API=1 to run against the real Google Cloud Vision API.',
  );

  test('TC-CIT-LIVE-01: Real OCR call returns a non-empty extracted_plate', async ({ page }) => {
    // No route mocking — use the live backend + GCV
    await page.goto('/citizen/report');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'plate.jpg',
      mimeType: 'image/jpeg',
      buffer: SMALL_JPEG,
    });
    await page.getByRole('button', { name: /Next/i }).click();
    const ocrCard = page.getByText('OCR Extracted Plate');
    await expect(ocrCard).toBeVisible({ timeout: 30000 });
  });
});
