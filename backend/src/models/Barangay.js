/**
 * Barangay model — maps to the BARANGAYS table.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'BARANGAYS';

const COLUMNS = {
  ID:              'barangay_id',
  NAME:            'barangay_name',
  NUMBER:          'barangay_number',
  IS_PARTICIPATING:'is_participating',
  CREATED_AT:      'created_at',
  UPDATED_AT:      'updated_at',
};

module.exports = { TABLE, COLUMNS };
