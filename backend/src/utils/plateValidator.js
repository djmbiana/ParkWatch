'use strict';

/**
 * Philippine license-plate validation & normalization helpers (LTO formats),
 * used to reconcile OCR output with manual input.
 *
 * Recognized formats (post-normalization):
 *   Private vehicle: ABC 1234     → /^[A-Z]{3} \d{4}$/
 *   Motorcycle:      ABC 12-3456  → /^[A-Z]{3} \d{2}-\d{4}$/
 */

const PRIVATE_PLATE = /^[A-Z]{3} \d{4}$/;
const MOTORCYCLE_PLATE = /^[A-Z]{3} \d{2}-\d{4}$/;
const PLATE_FORMAT = /^[A-Z]{3} \d{4}$|^[A-Z]{3} \d{2}-\d{4}$/;

/**
 * Canonicalizes plate text so OCR output, manual input, and stored
 * VEHICLES.plate_number values always compare equal:
 *   - trim + uppercase (per spec)
 *   - collapse runs of whitespace to a single space
 *   - remove spaces around hyphens ("12 - 3456" → "12-3456")
 *   - insert the missing space when letters and digits run together
 *     ("ABC1234" → "ABC 1234"), a common OCR/typing artifact
 */
const normalizePlate = (input) => {
  let plate = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');

  const compact = plate.match(/^([A-Z]{3}) ?(\d{4}|\d{2}-\d{4})$/);
  if (compact) plate = `${compact[1]} ${compact[2]}`;

  return plate;
};

/** True when the (already normalized) plate matches a recognized PH format. */
const isValidPlate = (plate) => PLATE_FORMAT.test(plate);

module.exports = { PRIVATE_PLATE, MOTORCYCLE_PLATE, PLATE_FORMAT, normalizePlate, isValidPlate };
