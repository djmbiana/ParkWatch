/**
 * NotificationLog model — maps to the NOTIFICATION_LOG table.
 * Audit trail of every push notification sent through Firebase Cloud Messaging.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'NOTIFICATION_LOG';

const COLUMNS = {
  ID:                'notification_id',
  REPORT_ID:         'report_id',
  RECIPIENT_ID:      'recipient_id',
  MESSAGE:           'message',
  NOTIFICATION_TYPE: 'notification_type',
  SENT_AT:           'sent_at',
  IS_READ:           'is_read',
  READ_AT:           'read_at',
  CREATED_AT:        'created_at',
};

/** Valid values for the `notification_type` ENUM — mirrors schema.sql. */
const TYPES = {
  STATUS_UPDATE: 'status_update',
  ESCALATION:    'escalation',
  RESOLUTION:    'resolution',
};

module.exports = { TABLE, COLUMNS, TYPES };
