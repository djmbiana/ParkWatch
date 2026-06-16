-- Migration 012 — per-report anonymous alias.
--
-- The research paper (Design Model Class Diagram, p.118) specifies that
-- citizens submit reports anonymously WITHOUT an account. Previously the
-- anonymous_alias lived only on USERS, so an anonymous report (citizen_id NULL)
-- had no alias to display. This adds the alias directly to the report row so it
-- can be generated at submission time and shown on the report detail / tracking
-- screens regardless of whether a USERS row exists.
--
-- citizen_id stays nullable (already "NULL = anonymous submission" per 005).

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN anonymous_alias VARCHAR(50) NULL AFTER citizen_id;
