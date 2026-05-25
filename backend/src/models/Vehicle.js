/**
 * Vehicle model — maps to the VEHICLES table.
 * total_violations and is_repeat_offender are maintained by application logic
 * on each report resolution (not computed by the DB).
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'VEHICLES';

const COLUMNS = {
  ID:                 'vehicle_id',
  PLATE_NUMBER:       'plate_number',
  VEHICLE_TYPE:       'vehicle_type',
  COLOR:              'color',
  TOTAL_VIOLATIONS:   'total_violations',
  IS_REPEAT_OFFENDER: 'is_repeat_offender',
  FIRST_RECORDED_AT:  'first_recorded_at',
  CREATED_AT:         'created_at',
  UPDATED_AT:         'updated_at',
};

module.exports = { TABLE, COLUMNS };
