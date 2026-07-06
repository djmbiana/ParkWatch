'use strict';

/**
 * Philippine license-plate validation & normalization helpers (LTO formats),
 * used to reconcile OCR output with manual input.
 *
 * Recognized formats (post-normalization):
 *   Private (current):  ABC 1234     → /^[A-Z]{3} \d{4}$/   (2014–present, 3+4)
 *   Private (legacy):   ABC 123      → /^[A-Z]{3} \d{3}$/   (pre-2014 series, 3+3)
 *   Motorcycle:         ABC 12-3456  → /^[A-Z]{3} \d{2}-\d{4}$/
 *   Conduction sticker: CS-XXXXXXXX  → /^CS-[A-Z0-9]{4,12}$/ (temp/no-LTO plate)
 *   No plate:           NOPLATE_XXXX → /^NOPLATE_[A-F0-9]{12}$/ (synthetic identifier)
 *
 * CS-/NOPLATE_ identifiers bypass OCR and standard LTO format validation; they
 * are stored as-is in VEHICLES.plate_number (fits within VARCHAR(20)).
 */

const PRIVATE_PLATE    = /^[A-Z]{3} \d{4}$/;
const LEGACY_PLATE     = /^[A-Z]{3} \d{3}$/;
const MOTORCYCLE_PLATE = /^[A-Z]{3} \d{2}-\d{4}$/;
const CONDUCTION_PLATE = /^CS-[A-Z0-9]{4,12}$/;
const NO_PLATE_ID      = /^NOPLATE_[A-F0-9]{12}$/;
const PLATE_FORMAT     = /^[A-Z]{3} \d{4}$|^[A-Z]{3} \d{3}$|^[A-Z]{3} \d{2}-\d{4}$|^CS-[A-Z0-9]{4,12}$|^NOPLATE_[A-F0-9]{12}$/;

/**
 * Canonicalizes plate text so OCR output, manual input, and stored
 * VEHICLES.plate_number values always compare equal:
 *   - trim + uppercase (per spec)
 *   - collapse runs of whitespace to a single space
 *   - remove spaces around hyphens ("12 - 3456" → "12-3456")
 *   - insert the missing space when letters and digits run together
 *     ("ABC1234" → "ABC 1234"), a common OCR/typing artifact
 *   CS- and NOPLATE_ identifiers are already canonical after uppercase, so the
 *   compact-plate regex is skipped for them.
 */
const normalizePlate = (input) => {
  let plate = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');

  // CS-/NOPLATE_ identifiers are canonical after the above normalizations.
  if (plate.startsWith('CS-') || plate.startsWith('NOPLATE_')) return plate;

  // \d{4} is listed before \d{3} so a 4-digit plate is never split as 3+stray;
  // the trailing $ anchor disambiguates by length either way.
  const compact = plate.match(/^([A-Z]{3}) ?(\d{4}|\d{3}|\d{2}-\d{4})$/);
  if (compact) plate = `${compact[1]} ${compact[2]}`;

  return plate;
};

/** True when the (already normalized) plate matches a recognized PH format. */
const isValidPlate = (plate) => PLATE_FORMAT.test(plate);

module.exports = { PRIVATE_PLATE, LEGACY_PLATE, MOTORCYCLE_PLATE, CONDUCTION_PLATE, NO_PLATE_ID, PLATE_FORMAT, normalizePlate, isValidPlate };
