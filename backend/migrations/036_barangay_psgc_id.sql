-- Migration 036 — PSGC reference id for BARANGAYS.
--
-- Supports importing the full barangay list for a city/district from the
-- Philippine Standard Geographic Code (PSGC) instead of manual entry, which
-- is error-prone (typos in name/number). psgc_id is the external, stable
-- reference id from the PSGC dataset; barangay_name stays the app's own
-- unique key so existing FKs (STREETS, USERS, VIOLATION_REPORTS) are
-- untouched. Nullable + UNIQUE: existing manually-entered rows have no
-- psgc_id until a sync backfills them; MySQL allows multiple NULLs under a
-- UNIQUE index.

ALTER TABLE BARANGAYS
  ADD COLUMN psgc_id VARCHAR(20) NULL UNIQUE AFTER barangay_number;
