-- Migration 015 — link a report to the submitting device's FCM token.
--
-- Anonymous reports have no USERS row, so push delivery (UC-03) needs the
-- device token attached to the report itself. When POST /api/reports includes
-- fcm_token, the token is upserted into PUBLIC_FCM_TOKENS and its id stored here;
-- notificationService.send() uses it when recipient_id is null.

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN fcm_token_id INT NULL AFTER access_token,
  ADD CONSTRAINT fk_reports_fcm_token
    FOREIGN KEY (fcm_token_id) REFERENCES PUBLIC_FCM_TOKENS (token_id) ON DELETE SET NULL;
