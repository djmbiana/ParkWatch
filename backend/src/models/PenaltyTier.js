/**
 * PenaltyTier model — maps to the PENALTY_TIERS table.
 * Tiers are matched by comparing vehicle.total_violations against
 * min_violations / max_violations at the time a report is verified.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'PENALTY_TIERS';

const COLUMNS = {
  ID:                'tier_id',
  NAME:              'tier_name',
  MIN_VIOLATIONS:    'min_violations',
  MAX_VIOLATIONS:    'max_violations',   // NULL = no upper bound
  FINE_AMOUNT:       'fine_amount',
  REQUIRES_CLAMPING: 'requires_clamping',
  CREATED_AT:        'created_at',
  UPDATED_AT:        'updated_at',
};

module.exports = { TABLE, COLUMNS };
