/**
 * Vehicle model — maps to the VEHICLES table (tracks total_violations and
 * is_repeat_offender across reports).
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'VEHICLES';

module.exports = { TABLE };
