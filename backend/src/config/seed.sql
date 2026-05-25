-- =============================================================================
-- ParkWatch — Reference / Lookup Seed Data (Malate District, Manila)
--
-- Contains static lookup data only: barangays, streets, penalty tiers,
-- and parking rules. No user accounts or violation records here.
--
-- Safe to run multiple times — INSERT IGNORE skips existing rows.
-- Executed automatically by the MySQL Docker container on first startup
-- (mounted as /docker-entrypoint-initdb.d/02-seed.sql, after 01-schema.sql).
--
-- Dev user accounts and sample reports → run: npm run seed
-- (executes src/config/seed-dev.js after containers are up)
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── BARANGAYS ───────────────────────────────────────────────────────────────
-- Five barangays in Malate District. Barangay 718 is marked as not yet
-- participating so we have a realistic test case for the is_participating flag.
INSERT IGNORE INTO BARANGAYS (barangay_name, barangay_number, is_participating) VALUES
  ('Barangay 688', '688', TRUE),
  ('Barangay 695', '695', TRUE),
  ('Barangay 700', '700', TRUE),
  ('Barangay 707', '707', TRUE),
  ('Barangay 718', '718', FALSE);

-- ─── STREETS ─────────────────────────────────────────────────────────────────
-- Street IDs referenced by seed-dev.js and PARKING_RULES below.
--   1 → Adriatico St       (B688)    7 → Padre Faura St   (B700)
--   2 → Remedios St        (B688)    8 → Pedro Gil St     (B700)
--   3 → Nakpil St          (B688)    9 → Bocobo St        (B707)
--   4 → M.H. del Pilar St  (B695)   10 → San Andres St    (B707)
--   5 → Mabini St          (B695)   11 → Quirino Ave      (B718)
--   6 → Taft Ave           (B700)   12 → Herran St        (B718)
INSERT IGNORE INTO STREETS (barangay_id, street_name, is_active) VALUES
  -- Barangay 688
  (1, 'Adriatico Street',      TRUE),
  (1, 'Remedios Street',       TRUE),
  (1, 'Nakpil Street',         TRUE),
  -- Barangay 695
  (2, 'M.H. del Pilar Street', TRUE),
  (2, 'Mabini Street',         TRUE),
  -- Barangay 700
  (3, 'Taft Avenue',           TRUE),
  (3, 'Padre Faura Street',    TRUE),
  (3, 'Pedro Gil Street',      TRUE),
  -- Barangay 707
  (4, 'Bocobo Street',         TRUE),
  (4, 'San Andres Street',     TRUE),
  -- Barangay 718 (not yet participating, streets still seeded for reference)
  (5, 'Quirino Avenue',        TRUE),
  (5, 'Herran Street',         TRUE);

-- ─── PENALTY_TIERS ───────────────────────────────────────────────────────────
-- Tiers are matched by comparing vehicle.total_violations against
-- min_violations/max_violations at the time a report is verified.
INSERT IGNORE INTO PENALTY_TIERS
  (tier_name,      min_violations, max_violations, fine_amount, requires_clamping)
VALUES
  ('1st Offense',  1,              1,              500.00,      FALSE),
  ('2nd Offense',  2,              3,              1000.00,     FALSE),
  ('3rd Offense+', 4,              NULL,           2000.00,     TRUE);

-- ─── PARKING_RULES ───────────────────────────────────────────────────────────
-- Maps specific streets to the violation types enforceable there.
-- The OCR/report workflow checks this table to validate incoming reports.
INSERT IGNORE INTO PARKING_RULES (street_id, violation_type, is_active) VALUES
  (1,  'No Parking Zone',       TRUE),
  (1,  'Double Parking',        TRUE),
  (2,  'Obstruction of Traffic',TRUE),
  (4,  'No Parking Zone',       TRUE),
  (6,  'Parking on Sidewalk',   TRUE),
  (7,  'No Parking Zone',       TRUE),
  (9,  'Double Parking',        TRUE),
  (10, 'No Parking Zone',       TRUE);

SET FOREIGN_KEY_CHECKS = 1;
