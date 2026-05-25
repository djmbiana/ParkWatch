/**
 * User model — maps to the USERS table.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'USERS';

const COLUMNS = {
  ID:              'user_id',
  FIRST_NAME:      'first_name',
  LAST_NAME:       'last_name',
  EMAIL:           'email',
  PASSWORD_HASH:   'password_hash',
  PHONE_NUMBER:    'phone_number',
  ROLE:            'role',
  ANONYMOUS_ALIAS: 'anonymous_alias',
  BARANGAY_ID:     'barangay_id',
  FCM_TOKEN:       'fcm_token',
  IS_VERIFIED:     'is_verified',
  IS_ACTIVE:       'is_active',
  CREATED_AT:      'created_at',
  UPDATED_AT:      'updated_at',
};

/** Valid values for the `role` ENUM — mirrors schema.sql. */
const ROLES = {
  CITIZEN:          'citizen',
  BRGY_OFFICIAL:    'brgy_official',
  MTPB_OFFICER:     'mtpb_officer',
  MTPB_SUPERVISOR:  'mtpb_supervisor',
  ADMIN:            'admin',
};

module.exports = { TABLE, COLUMNS, ROLES };
