-- Migration 017 — staff push tokens + escalation re-notification tracking.
--
-- 1) USER_FCM_TOKENS: device token for an authenticated staff account (barangay
--    official, MTPB officer, supervisor, admin). Unlike PUBLIC_FCM_TOKENS
--    (anonymous citizens), this is keyed by user_id so notificationService can
--    push to a known recipient. One token per user — re-registering upserts.
--
-- 2) VIOLATION_REPORTS.renotified / renotified_at: the escalation job
--    (src/jobs/escalationJob.js, UC-10) re-notifies MTPB officers once the
--    response window lapses, then escalates to a supervisor if still
--    unacknowledged. These flags co-locate that state with the existing
--    is_escalated / escalated_at columns and make both job stages idempotent.

CREATE TABLE IF NOT EXISTS USER_FCM_TOKENS (
  user_id     INT          NOT NULL,
  fcm_token   VARCHAR(512) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_fcm_user
    FOREIGN KEY (user_id) REFERENCES USERS (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN renotified    BOOLEAN  NOT NULL DEFAULT FALSE AFTER is_escalated,
  ADD COLUMN renotified_at DATETIME NULL                  AFTER renotified;
