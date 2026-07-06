-- Migration 032: SYSTEM_CONFIG key-value table for runtime-editable settings
-- Used by: escalation timing (supervisor can adjust response/renotify windows without a redeploy)

CREATE TABLE IF NOT EXISTS SYSTEM_CONFIG (
  config_key   VARCHAR(100)  NOT NULL PRIMARY KEY,
  config_value VARCHAR(500)  NOT NULL,
  label        VARCHAR(200)  NULL,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   INT           NULL,
  FOREIGN KEY (updated_by) REFERENCES USERS(user_id) ON DELETE SET NULL
);

INSERT INTO SYSTEM_CONFIG (config_key, config_value, label) VALUES
  ('escalation_response_window_minutes', '60',  'Response window (minutes) — how long before an unacknowledged verified report is re-notified'),
  ('escalation_renotify_window_minutes', '15',  'Re-notify window (minutes) — how long after re-notification before the report is escalated')
ON DUPLICATE KEY UPDATE config_key = config_key;
