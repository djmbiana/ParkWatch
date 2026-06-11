-- Migration 007 — NOTIFICATION_LOG (references VIOLATION_REPORTS, USERS)
-- DDL matches src/config/schema.sql exactly.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS NOTIFICATION_LOG (
  notification_id   INT          NOT NULL AUTO_INCREMENT,
  report_id         INT,
  recipient_id      INT,
  message           VARCHAR(500) NOT NULL,
  notification_type ENUM('status_update','escalation','resolution')
                      NOT NULL DEFAULT 'status_update',
  sent_at           DATETIME,
  is_read           BOOLEAN      NOT NULL DEFAULT FALSE,
  read_at           DATETIME,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  CONSTRAINT fk_notiflog_report
    FOREIGN KEY (report_id)    REFERENCES VIOLATION_REPORTS (report_id) ON DELETE SET NULL,
  CONSTRAINT fk_notiflog_recipient
    FOREIGN KEY (recipient_id) REFERENCES USERS (user_id)              ON DELETE SET NULL,
  INDEX idx_notiflog_recipient (recipient_id),
  INDEX idx_notiflog_report    (report_id),
  INDEX idx_notiflog_is_read   (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
