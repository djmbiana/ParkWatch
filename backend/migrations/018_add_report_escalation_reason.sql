-- Migration 018 — escalation reason on VIOLATION_REPORTS.
--
-- The escalation job (src/jobs/escalationJob.js, UC-10) records WHY a report was
-- escalated (e.g. unacknowledged after re-notification), and the supervisor
-- queue (GET /api/reports/queue/supervisor) displays it. Co-located with the
-- existing is_escalated / escalated_at columns.

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN escalation_reason VARCHAR(255) NULL AFTER escalated_at;
