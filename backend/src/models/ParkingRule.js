/**
 * ParkingRule model — maps to the PARKING_RULES table.
 * Associates enforceable violation types with specific streets.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'PARKING_RULES';

const COLUMNS = {
  ID:             'rule_id',
  STREET_ID:      'street_id',
  VIOLATION_TYPE: 'violation_type',
  IS_ACTIVE:      'is_active',
  CREATED_AT:     'created_at',
  UPDATED_AT:     'updated_at',
};

module.exports = { TABLE, COLUMNS };
