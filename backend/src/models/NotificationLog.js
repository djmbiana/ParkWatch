/**
 * NotificationLog model — maps to the NOTIFICATION_LOG table (audit trail of
 * push/SMS/email notifications).
 * Data-access logic (via the mysql2 pool in src/config/db.js) is added in a later
 * sprint. See src/config/schema.sql for the table definition.
 */
const TABLE = 'NOTIFICATION_LOG';

module.exports = { TABLE };
