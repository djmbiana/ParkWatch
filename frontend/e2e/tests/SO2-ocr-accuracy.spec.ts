import { test, expect, request } from '@playwright/test';
import { API_URL } from '../helpers/testData';

/**
 * SO2 — OCR Accuracy Benchmark (paper p.162, NFR-04: ≥ 94%).
 *
 * Requires real Philippine plate photos already uploaded to GCS (the OCR runs
 * server-side against a gs:// or https URL). These are gated behind env vars so
 * the suite stays green in CI without the dataset:
 *
 *   TEST_PLATE_BENCHMARK=true
 *   TEST_PLATE_URIS="gs://bucket/p1.jpg,gs://bucket/p2.jpg,..."   (≥ 20)
 *   TEST_PLATE_EXPECTED="ABC 1234,XYZ 5678,..."                    (aligned)
 *
 * The preview endpoint POST /api/reports/ocr returns
 *   { data: { extracted_plate, confidence_score } }
 * and creates no DB row, so it is safe to call repeatedly.
 */
test.describe('SO2 — OCR Accuracy Benchmark (NFR-04: ≥ 94%)', () => {
  test.skip(
    !process.env.TEST_PLATE_BENCHMARK,
    'Set TEST_PLATE_BENCHMARK=true and TEST_PLATE_URIS/EXPECTED to run the OCR benchmark.',
  );

  test('TC-SO2-01: OCR accuracy ≥ 94% on a ≥20-plate dataset', async () => {
    const uris = (process.env.TEST_PLATE_URIS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const expected = (process.env.TEST_PLATE_EXPECTED || '').split(',').map((s) => s.trim().toUpperCase());
    test.skip(uris.length < 20, `Need ≥ 20 plate URIs, got ${uris.length}.`);

    const ctx = await request.newContext();
    let correct = 0;
    const rows: Array<{ expected: string; got: string; conf: number | null; pass: boolean }> = [];

    for (let i = 0; i < uris.length; i++) {
      const res = await ctx.post(`${API_URL}/api/reports/ocr`, { data: { photo_url: uris[i] } });
      const body = await res.json();
      const got = (body.data?.extracted_plate || '').toUpperCase().trim();
      const pass = got === expected[i];
      if (pass) correct++;
      rows.push({ expected: expected[i], got, conf: body.data?.confidence_score ?? null, pass });
    }
    await ctx.dispose();

    const accuracy = (correct / uris.length) * 100;
    // eslint-disable-next-line no-console
    console.log(`\nOCR Accuracy: ${correct}/${uris.length} = ${accuracy.toFixed(1)}% (target ≥ 94%)`);
    rows.forEach((r) => {
      // eslint-disable-next-line no-console
      console.log(`  ${r.pass ? '✓' : '✗'} expected ${r.expected} | got ${r.got} | conf ${r.conf ?? '—'}`);
    });

    expect(accuracy).toBeGreaterThanOrEqual(94);
  });

  test('TC-SO2-02: OCR preview returns a confidence score', async () => {
    const uri = process.env.TEST_PLATE_IMAGE_URI;
    test.skip(!uri, 'Set TEST_PLATE_IMAGE_URI to run.');
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/api/reports/ocr`, { data: { photo_url: uri } });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('confidence_score');
    await ctx.dispose();
  });

  test('TC-SO2-03: Low-confidence OCR yields an empty/low reading for manual review', async () => {
    const uri = process.env.TEST_BLURRY_PLATE_URI;
    test.skip(!uri, 'Set TEST_BLURRY_PLATE_URI to run.');
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/api/reports/ocr`, { data: { photo_url: uri } });
    const body = await res.json();
    // A blurry/obscured plate should surface as no plate or a low confidence,
    // so the citizen is prompted to type it (Step-2 manual entry path).
    const plate = body.data?.extracted_plate || '';
    const conf = body.data?.confidence_score ?? 0;
    expect(plate === '' || conf < 90).toBeTruthy();
    await ctx.dispose();
  });
});
