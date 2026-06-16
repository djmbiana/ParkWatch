-- Migration 014 — per-report access token.
--
-- Anonymous citizens track a report by its id, but ids are sequential and
-- guessable. This adds an unguessable bearer token (crypto.randomBytes(32) hex
-- = 64 chars) generated at submission. GET /api/reports/:id then requires
-- either a staff JWT or ?token=<access_token>, so only the submitter (who holds
-- the token, stored client-side) can read an anonymous report.

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN access_token VARCHAR(64) NULL AFTER anonymous_alias,
  ADD UNIQUE KEY uq_reports_access_token (access_token);
