'use strict';

/**
 * Unit tests for src/services/ocrService.js and src/utils/plateValidator.js.
 * The Vision API client is mocked — no GCP credentials or network needed.
 */

const mockTextDetection = jest.fn();
const mockDocTextDetection = jest.fn();
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    textDetection: (...args) => mockTextDetection(...args),
    documentTextDetection: (...args) => mockDocTextDetection(...args),
  })),
}));

const ocrService = require('../src/services/ocrService');
const { normalizePlate, isValidPlate } = require('../src/utils/plateValidator');

const PHOTO_URL = 'https://storage.googleapis.com/test-bucket/photos/7/123_plate.jpg';

/** Builds a Vision "word" object from plain text + confidence. */
const word = (text, confidence) => ({
  confidence,
  symbols: text.split('').map((t) => ({ text: t })),
});

/** Wraps word arrays into a minimal TEXT_DETECTION response. */
const visionResult = (paragraphWordSets, fullText = '') => ({
  textAnnotations: fullText ? [{ description: fullText }] : [],
  fullTextAnnotation: paragraphWordSets
    ? { pages: [{ blocks: [{ paragraphs: paragraphWordSets.map((words) => ({ words })) }] }] }
    : null,
});

beforeEach(() => {
  process.env.OCR_CONFIDENCE_THRESHOLD = '70';
  mockTextDetection.mockReset();
  mockDocTextDetection.mockReset();
  mockDocTextDetection.mockResolvedValue([visionResult(null)]); // default: nothing useful
});

// ---------------------------------------------------------------------------
// plateValidator
// ---------------------------------------------------------------------------

describe('plateValidator', () => {
  it.each([
    ['abc 1234', 'ABC 1234'],
    ['  ABC   1234  ', 'ABC 1234'],
    ['ABC1234', 'ABC 1234'],          // missing space inserted
    ['abc 123', 'ABC 123'],           // legacy 3+3 plate (pre-2014 series)
    ['PAQ132', 'PAQ 132'],            // legacy, missing space inserted
    ['abc 12 - 3456', 'ABC 12-3456'], // spaces around hyphen removed
    ['ABC12-3456', 'ABC 12-3456'],
  ])('normalizes %j to %j (valid)', (input, expected) => {
    const normalized = normalizePlate(input);
    expect(normalized).toBe(expected);
    expect(isValidPlate(normalized)).toBe(true);
  });

  it.each(['AB 1234', 'ABCD 1234', 'ABC 12', 'ABC 12345', '1234 ABC', '', '   '])(
    'rejects %j',
    (input) => {
      expect(isValidPlate(normalizePlate(input))).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// validatePlateFormat
// ---------------------------------------------------------------------------

describe('validatePlateFormat', () => {
  it('accepts and normalizes a private-vehicle plate', async () => {
    await expect(ocrService.validatePlateFormat(' abc 1234 '))
      .resolves.toEqual({ valid: true, normalized: 'ABC 1234' });
  });

  it('accepts a motorcycle plate', async () => {
    await expect(ocrService.validatePlateFormat('xyz 12-3456'))
      .resolves.toEqual({ valid: true, normalized: 'XYZ 12-3456' });
  });

  it('rejects a malformed plate', async () => {
    const result = await ocrService.validatePlateFormat('ZZ-99');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractPlate
// ---------------------------------------------------------------------------

describe('extractPlate', () => {
  it('passes the GCS URI to Vision without re-downloading the image', async () => {
    mockTextDetection.mockResolvedValue([visionResult([[word('ABC', 0.98), word('1234', 0.96)]])]);
    await ocrService.extractPlate(PHOTO_URL);

    expect(mockTextDetection).toHaveBeenCalledWith({
      image: { source: { imageUri: 'gs://test-bucket/photos/7/123_plate.jpg' } },
    });
  });

  it('extracts a high-confidence plate (no manual review)', async () => {
    mockTextDetection.mockResolvedValue([
      visionResult([[word('METRO', 0.91), word('ABC', 0.98), word('1234', 0.96)]], 'METRO\nABC 1234'),
    ]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('ABC 1234');
    expect(result.confidence_score).toBe(97); // avg(0.98, 0.96) * 100
    expect(result.needs_manual_review).toBe(false);
    expect(JSON.parse(result.raw_response)).toBeTruthy();
  });

  it('extracts a motorcycle plate', async () => {
    mockTextDetection.mockResolvedValue([visionResult([[word('ABC', 0.9), word('12-3456', 0.9)]])]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('ABC 12-3456');
    expect(result.needs_manual_review).toBe(false);
  });

  it('flags manual review when confidence is below the threshold', async () => {
    mockTextDetection.mockResolvedValue([visionResult([[word('ABC', 0.5), word('1234', 0.6)]])]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('ABC 1234');
    expect(result.confidence_score).toBe(55);
    expect(result.needs_manual_review).toBe(true);
  });

  it('flags manual review when no plate-like text is found', async () => {
    mockTextDetection.mockResolvedValue([
      visionResult([[word('NO', 0.99), word('PARKING', 0.99)]], 'NO PARKING'),
    ]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBeNull();
    expect(result.confidence_score).toBeNull();
    expect(result.needs_manual_review).toBe(true);
  });

  it('picks the highest-confidence candidate when several match', async () => {
    mockTextDetection.mockResolvedValue([
      visionResult([
        [word('ABC', 0.8), word('1234', 0.8)],
        [word('XYZ', 0.95), word('5678', 0.95)],
      ]),
    ]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('XYZ 5678');
    expect(result.confidence_score).toBe(95);
  });

  it('falls back to text lines (confidence null → manual review) without fullTextAnnotation', async () => {
    mockTextDetection.mockResolvedValue([visionResult(null, 'ABC 1234\nMANILA')]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('ABC 1234');
    expect(result.confidence_score).toBeNull();
    expect(result.needs_manual_review).toBe(true);
    // an unscored match should have triggered the rescore attempt
    expect(mockDocTextDetection).toHaveBeenCalledTimes(1);
  });

  it('rescores via DOCUMENT_TEXT_DETECTION when TEXT_DETECTION omits confidences', async () => {
    // TEXT_DETECTION found the plate but every word reads confidence 0
    mockTextDetection.mockResolvedValue([visionResult([[word('ABC', 0), word('1234', 0)]])]);
    mockDocTextDetection.mockResolvedValue([visionResult([[word('ABC', 0.99), word('1234', 0.99)]])]);
    const result = await ocrService.extractPlate(PHOTO_URL);

    expect(result.extracted_plate).toBe('ABC 1234');
    expect(result.confidence_score).toBe(99);
    expect(result.needs_manual_review).toBe(false);
  });

  it('does not call DOCUMENT_TEXT_DETECTION when TEXT_DETECTION already scored the plate', async () => {
    mockTextDetection.mockResolvedValue([visionResult([[word('ABC', 0.98), word('1234', 0.96)]])]);
    await ocrService.extractPlate(PHOTO_URL);

    expect(mockDocTextDetection).not.toHaveBeenCalled();
  });

  it('throws 502 when the Vision call fails', async () => {
    mockTextDetection.mockRejectedValue(new Error('credentials missing'));
    await expect(ocrService.extractPlate(PHOTO_URL)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('throws 400 for a photo URL outside our storage', async () => {
    await expect(ocrService.extractPlate('https://evil.example.com/img.jpg')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockTextDetection).not.toHaveBeenCalled();
  });
});
