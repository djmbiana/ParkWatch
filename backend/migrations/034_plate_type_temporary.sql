-- Migration 034: Add 'temporary' value to the VIOLATION_REPORTS.plate_type ENUM.
-- Temporary Motor Vehicle Plates (LTO-issued while waiting for the permanent plate)
-- use the same ABC 1234 format as a regular plate but must be distinguished because
-- they cannot be cross-referenced against the registered-plate history in VEHICLES.
ALTER TABLE VIOLATION_REPORTS
  MODIFY COLUMN plate_type ENUM('regular','conduction','no_plate','temporary') NOT NULL DEFAULT 'regular';
