/**
 * ParkingRule model — maps to the PARKING_RULES table (per-barangay/street rules
 * and no-parking time windows).
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'PARKING_RULES';

module.exports = { TABLE };
