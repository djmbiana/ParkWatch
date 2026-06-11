'use strict';

/**
 * OCR service — extracts license-plate text from evidence photos using
 * Google Cloud Vision TEXT_DETECTION, then compares the result against
 * OCR_CONFIDENCE_THRESHOLD to decide whether manual review is required.
 *
 * FR: OCR-assisted license-plate extraction (citizen reporting pipeline, Step 2).
 *
 * The image is never re-downloaded: the GCS URI (gs://bucket/path) is passed
 * straight to the Vision API, which reads it server-side.
 */

const vision = require('@google-cloud/vision');

const logger = require('../config/logger');
const { toGcsUri } = require('./storageService');
const { normalizePlate, isValidPlate } = require('../utils/plateValidator');

// Lazily constructed so the app (and tests) can be imported without GCP
// credentials present; the client is only created on the first OCR call.
let client = null;
const getClient = () => {
  if (!client) client = new vision.ImageAnnotatorClient();
  return client;
};

const confidenceThreshold = () =>
  parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD) || 70;

/**
 * Builds candidate plate strings from the Vision response.
 *
 * Vision splits "ABC 1234" into separate words, so single annotations rarely
 * match the plate regex on their own. We walk fullTextAnnotation (the only
 * part of a TEXT_DETECTION response with reliable per-word confidence) and
 * emit every run of 1–3 consecutive words in each paragraph as a candidate,
 * with the run's average word confidence (0–100).
 *
 * As a fallback (when fullTextAnnotation is missing), each line of the full
 * text block and each individual annotation are emitted with confidence null —
 * a null-confidence match still surfaces the plate but forces manual review.
 */
const buildCandidates = (result) => {
  const candidates = [];

  const pages = result.fullTextAnnotation?.pages || [];
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        const words = (paragraph.words || []).map((word) => ({
          text: (word.symbols || []).map((s) => s.text).join(''),
          // Protobuf defaults absent confidence to 0, so 0 means "not scored",
          // not "0% confident" — treat it as unknown.
          confidence: typeof word.confidence === 'number' && word.confidence > 0
            ? word.confidence
            : null,
        }));

        for (let size = 1; size <= 3; size++) {
          for (let start = 0; start + size <= words.length; start++) {
            const run = words.slice(start, start + size);
            const confidences = run.map((w) => w.confidence).filter((c) => c !== null);
            candidates.push({
              text: run.map((w) => w.text).join(' '),
              confidence: confidences.length
                ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
                : null,
            });
          }
        }
      }
    }
  }

  const annotations = result.textAnnotations || [];
  if (annotations.length > 0) {
    for (const line of String(annotations[0].description || '').split('\n')) {
      candidates.push({ text: line, confidence: null });
    }
    for (const annotation of annotations.slice(1)) {
      candidates.push({ text: annotation.description, confidence: null });
    }
  }

  return candidates;
};

/**
 * Runs TEXT_DETECTION on a GCS-hosted photo and finds the text block that
 * best matches a Philippine plate format. When several candidates match,
 * the highest-confidence one wins.
 *
 * @param {string} photoUrl  https://storage.googleapis.com/... or gs://... URL
 * @returns {Promise<{
 *   extracted_plate: string|null,
 *   confidence_score: number|null,   // 0–100
 *   raw_response: string,            // JSON.stringify of the full API response
 *   needs_manual_review: boolean     // confidence < threshold OR no plate found
 * }>}
 */
const callVision = async (method, gcsUri) => {
  try {
    const [result] = await getClient()[method]({ image: { source: { imageUri: gcsUri } } });
    return result;
  } catch (err) {
    logger.error(`Vision ${method} failed for ${gcsUri}: ${err.message}`);
    const wrapped = new Error('OCR processing failed. Please try again or enter the plate manually.');
    wrapped.statusCode = 502;
    throw wrapped;
  }
};

/** Best plate-format match among the candidates, by confidence. */
const pickBest = (result) => {
  let best = null;
  for (const candidate of buildCandidates(result)) {
    const plate = normalizePlate(candidate.text);
    if (!isValidPlate(plate)) continue;
    if (!best || (candidate.confidence ?? -1) > (best.confidence ?? -1)) {
      best = { plate, confidence: candidate.confidence };
    }
  }
  return best;
};

const extractPlate = async (photoUrl) => {
  const gcsUri = toGcsUri(photoUrl); // throws 400 on malformed/foreign URLs

  const result = await callVision('textDetection', gcsUri);
  let best = pickBest(result);

  // TEXT_DETECTION frequently omits word confidences (every word reads 0).
  // When a plate was found but not scored, re-score with DOCUMENT_TEXT_DETECTION,
  // which reliably populates them — otherwise every report would be forced to
  // manual review regardless of photo quality.
  if (best && best.confidence === null) {
    const docResult = await callVision('documentTextDetection', gcsUri);
    const docBest = pickBest(docResult);
    if (docBest) best = docBest;
  }

  const confidence = best && best.confidence !== null
    ? Math.round(best.confidence * 100) / 100
    : null;

  return {
    extracted_plate: best ? best.plate : null,
    confidence_score: confidence,
    raw_response: JSON.stringify(result),
    needs_manual_review: !best || confidence === null || confidence < confidenceThreshold(),
  };
};

/**
 * Validates a plate string against the Philippine formats after normalizing it
 * (trim, uppercase, whitespace/hyphen cleanup — see utils/plateValidator.js).
 *
 * @returns {Promise<{ valid: boolean, normalized: string }>}
 */
const validatePlateFormat = async (plateNumber) => {
  const normalized = normalizePlate(plateNumber);
  return { valid: isValidPlate(normalized), normalized };
};

module.exports = { extractPlate, validatePlateFormat };
