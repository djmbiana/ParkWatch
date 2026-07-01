-- Migration 024 — additional evidence photos on a violation report.
--
-- The primary photo (photo_path) drives OCR + plate detection. Citizens can attach
-- extra photos as supporting detail (context, other angles) to strengthen a report
-- and guard against false reports — reviewed by the barangay/MTPB. Stored as a JSON
-- array of GCS object paths in a TEXT column.

ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN additional_photos TEXT NULL AFTER photo_path;
