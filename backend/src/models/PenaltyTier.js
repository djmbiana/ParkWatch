/**
 * PenaltyTier model — maps to the PENALTY_TIERS table (escalating fines by offense count).
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'PENALTY_TIERS';

module.exports = { TABLE };
