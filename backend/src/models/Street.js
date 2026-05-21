/**
 * Street model — maps to the STREETS table.
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'STREETS';

module.exports = { TABLE };
