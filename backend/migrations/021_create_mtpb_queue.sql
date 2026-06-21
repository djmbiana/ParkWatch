-- Migration 021 — MTPB_QUEUE (paper data dictionary). Tracks the response
-- timer and escalation state for verified reports awaiting MTPB action.
-- Escalation state previously lived on VIOLATION_REPORTS columns; those remain
-- (kept in sync) for backward compatibility, with MTPB_QUEUE as the source of
-- truth for the escalation job.
--
-- SYSTEM_CONFIG does not exist in this deployment, so the backfill uses the
-- literal default response window of 60 minutes.

CREATE TABLE IF NOT EXISTS MTPB_QUEUE (
  queue_id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id         INT           NOT NULL UNIQUE,
  queued_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  response_deadline DATETIME      NOT NULL,
  renotified        BOOLEAN       NOT NULL DEFAULT FALSE,
  renotified_at     DATETIME      NULL,
  is_escalated      BOOLEAN       NOT NULL DEFAULT FALSE,
  escalated_at      DATETIME      NULL,
  escalation_reason VARCHAR(255)  NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mtpb_queue_report
    FOREIGN KEY (report_id) REFERENCES VIOLATION_REPORTS(report_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: queue entry for every report that has been verified.
INSERT IGNORE INTO MTPB_QUEUE (report_id, queued_at, response_deadline)
SELECT
  report_id,
  COALESCE(verified_at, submitted_at),
  DATE_ADD(COALESCE(verified_at, submitted_at), INTERVAL 60 MINUTE)
FROM VIOLATION_REPORTS
WHERE status IN ('verified', 'acknowledged', 'dispatched', 'resolved', 'escalated')
  AND verified_at IS NOT NULL;

-- Carry existing escalation state onto the queue rows.
UPDATE MTPB_QUEUE mq
JOIN VIOLATION_REPORTS vr ON mq.report_id = vr.report_id
SET mq.is_escalated      = TRUE,
    mq.escalated_at       = vr.escalated_at,
    mq.escalation_reason  = vr.escalation_reason,
    mq.renotified         = TRUE,
    mq.renotified_at      = vr.escalated_at
WHERE vr.is_escalated = TRUE;
