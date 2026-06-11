-- Migration 008 — add 'escalated' to VIOLATION_REPORTS.status
-- The shared data dictionary defines the status flow
--   verified → escalated (system, when the MTPB response timer expires)
-- as a status value, alongside the is_escalated flag. The Sprint 1 ENUM
-- lacked it; adding a value at the end of an ENUM is metadata-only in MySQL 8.

ALTER TABLE VIOLATION_REPORTS
  MODIFY status ENUM('pending','verified','acknowledged','dispatched','resolved','rejected','escalated')
    NOT NULL DEFAULT 'pending';
