/**
 * Street model — maps to the STREETS table.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'STREETS';

const COLUMNS = {
  ID:          'street_id',
  BARANGAY_ID: 'barangay_id',
  NAME:        'street_name',
  IS_ACTIVE:   'is_active',
  CREATED_AT:  'created_at',
  UPDATED_AT:  'updated_at',
};

module.exports = { TABLE, COLUMNS };
