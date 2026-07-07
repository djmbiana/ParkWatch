'use strict';

/**
 * Philippine license-plate validation & normalization helpers (LTO formats),
 * used to reconcile OCR output with manual input.
 *
 * Recognized formats (post-normalization):
 *
 *   Regular plates (permanent):
 *     Private (current):  ABC 1234     → /^[A-Z]{3} \d{4}$/   (2014–present, 3+4)
 *     Private (legacy):   ABC 123      → /^[A-Z]{3} \d{3}$/   (pre-2014 series, 3+3)
 *     Motorcycle:         ABC 12-3456  → /^[A-Z]{3} \d{2}-\d{4}$/
 *
 *   Temporary Motor Vehicle Plate (white plate with "REGISTERED" / dealer-issued
 *   while waiting for the permanent LTO plate):
 *     4-wheel:         AB 1234   → /^[A-Z]{2} \d{4}$/  (2 letters + 4 digits)
 *     Improvised MC:   AB 12345  → /^[A-Z]{2} \d{5}$/  (2 letters + 5 digits,
 *                                    used for lost/mutilated motorcycle plates)
 *     Stored with plate_type = 'temporary' in VIOLATION_REPORTS.
 *
 *   Conduction sticker (yellow LTO pre-registration sticker):
 *     Format:  XY ZZZZ  → /^[A-Z][A-Z0-9] [A-Z0-9]{4}$/
 *     Examples: "AA 123A", "D1 E777"
 *     Left blue column (2 chars) = LTO district/series code.
 *     Black body (4 chars) = alphanumeric sticker number.
 *     Stored with plate_type = 'conduction' in VIOLATION_REPORTS.
 *
 *   No plate (synthetic identifier):
 *     NOPLATE_XXXXXXXXXXXX → /^NOPLATE_[A-F0-9]{12}$/
 *     Generated client-side (12 hex digits = 6 random bytes).
 */

const PRIVATE_PLATE    = /^[A-Z]{3} \d{4}$/;
const LEGACY_PLATE     = /^[A-Z]{3} \d{3}$/;
const MOTORCYCLE_PLATE = /^[A-Z]{3} \d{2}-\d{4}$/;

// Temporary plate (white "REGISTERED" / dealer-issued).
// 4-wheel: AB 1234 (2 letters + 4 digits).
// Improvised MC: AB 12345 (2 letters + 5 digits, lost/mutilated plate replacement).
const TEMPORARY_PLATE    = /^[A-Z]{2} \d{4}$/;
const TEMPORARY_MC_PLATE = /^[A-Z]{2} \d{5}$/;

// Conduction sticker: 2-char district code + space + 4-char alphanumeric body.
// First char of prefix must be a letter (LTO district codes start with A-Z).
const CONDUCTION_PLATE = /^[A-Z][A-Z0-9] [A-Z0-9]{4}$/;

const NO_PLATE_ID = /^NOPLATE_[A-F0-9]{12}$/;

const PLATE_FORMAT = new RegExp(
  [
    PRIVATE_PLATE.source,
    LEGACY_PLATE.source,
    MOTORCYCLE_PLATE.source,
    TEMPORARY_PLATE.source,
    TEMPORARY_MC_PLATE.source,
    CONDUCTION_PLATE.source,
    NO_PLATE_ID.source,
  ].join('|')
);

/**
 * Canonicalizes plate text (trim, uppercase, collapse whitespace, hyphen cleanup)
 * and inserts the missing space for compact inputs:
 *   "ABC1234"  → "ABC 1234"   (regular compact)
 *   "AB1234"   → "AB 1234"    (temporary 4-wheel compact)
 *   "AB12345"  → "AB 12345"   (improvised MC compact)
 *   "AA123A"   → "AA 123A"    (conduction sticker compact)
 *   "D1E777"   → "D1 E777"    (conduction sticker compact, digit in code)
 */
const normalizePlate = (input) => {
  let plate = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');

  if (plate.startsWith('NOPLATE_')) return plate;

  // Regular plate: 3 letters + digits (4, 3, or 2-4 with hyphen).
  // \d{4} before \d{3} so 4-digit is never misread as 3-digit.
  const compactRegular = plate.match(/^([A-Z]{3}) ?(\d{4}|\d{3}|\d{2}-\d{4})$/);
  if (compactRegular) return `${compactRegular[1]} ${compactRegular[2]}`;

  // Temporary 4-wheel: exactly 2 letters + 4 digits (no space).
  const compactTemp4 = plate.match(/^([A-Z]{2}) ?(\d{4})$/);
  if (compactTemp4) return `${compactTemp4[1]} ${compactTemp4[2]}`;

  // Improvised MC: exactly 2 letters + 5 digits.
  const compactTempMC = plate.match(/^([A-Z]{2}) ?(\d{5})$/);
  if (compactTempMC) return `${compactTempMC[1]} ${compactTempMC[2]}`;

  // Conduction sticker: 2-char prefix ([A-Z][A-Z0-9]) + 4 alphanumeric body.
  // Must contain at least one letter in the body to avoid false-matching
  // temporary plates already handled above.
  const compactConduction = plate.match(/^([A-Z][A-Z0-9])([A-Z0-9]{4})$/);
  if (compactConduction) return `${compactConduction[1]} ${compactConduction[2]}`;

  return plate;
};

/** True when the plate matches any recognized PH format. */
const isValidPlate = (plate) => PLATE_FORMAT.test(plate);

/** True when the plate matches the conduction sticker format. */
const isConductionPlate = (plate) => CONDUCTION_PLATE.test(plate);

/** True when the plate matches a temporary plate format (4-wheel or improvised MC). */
const isTemporaryPlate = (plate) => TEMPORARY_PLATE.test(plate) || TEMPORARY_MC_PLATE.test(plate);

module.exports = {
  PRIVATE_PLATE, LEGACY_PLATE, MOTORCYCLE_PLATE,
  TEMPORARY_PLATE, TEMPORARY_MC_PLATE,
  CONDUCTION_PLATE, NO_PLATE_ID,
  PLATE_FORMAT,
  normalizePlate, isValidPlate, isConductionPlate, isTemporaryPlate,
};
