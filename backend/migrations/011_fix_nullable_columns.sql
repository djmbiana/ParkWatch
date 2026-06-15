-- Migration 011: Add NOT NULL constraints missing from spec
-- Covers BARANGAYS.barangay_number, VEHICLES.first_recorded_at,
-- and NOTIFICATION_LOG.sent_at (Tables 25, 24, 29 — pp.133–140).

-- BARANGAYS.barangay_number: spec says NOT NULL.
-- All seeded rows already have values so this is safe.
ALTER TABLE BARANGAYS
  MODIFY COLUMN barangay_number VARCHAR(10) NOT NULL;

-- VEHICLES.first_recorded_at: spec says NOT NULL DEFAULT CURRENT_TIMESTAMP.
-- Backfill any NULL rows with created_at before adding constraint.
UPDATE VEHICLES SET first_recorded_at = created_at WHERE first_recorded_at IS NULL;
ALTER TABLE VEHICLES
  MODIFY COLUMN first_recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NOTIFICATION_LOG.sent_at: spec says NOT NULL DEFAULT CURRENT_TIMESTAMP.
-- Backfill any NULL rows before adding constraint.
UPDATE NOTIFICATION_LOG SET sent_at = created_at WHERE sent_at IS NULL;
ALTER TABLE NOTIFICATION_LOG
  MODIFY COLUMN sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
