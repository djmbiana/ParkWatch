/**
 * ViolationReport model — maps to the VIOLATION_REPORTS table (the core entity:
 * stores ocr_extracted_plate, manual_plate_input, status and escalation flags).
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'VIOLATION_REPORTS';

module.exports = { TABLE };
