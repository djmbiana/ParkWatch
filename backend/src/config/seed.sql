-- =============================================================================
-- ParkWatch — Reference / Lookup Seed Data (Malate District, Manila)
--
-- Contains static lookup data only: barangays, streets, penalty tiers,
-- and parking rules. No user accounts or violation records here.
--
-- Safe to run multiple times — every statement upserts or skips existing rows.
-- Executed automatically by the MySQL Docker container on first startup
-- (mounted as /docker-entrypoint-initdb.d/02-seed.sql, after 01-schema.sql).
--
-- Test accounts and sample reports → run: npm run seed (seeds/seed.js),
-- optionally followed by: npm run seed:dev (sample vehicles/reports).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── BARANGAYS ───────────────────────────────────────────────────────────────
-- Malate District barangays 701–720, all participating in the pilot.
INSERT INTO BARANGAYS (barangay_name, barangay_number, is_participating) VALUES
  ('Barangay 701', '701', TRUE),
  ('Barangay 702', '702', TRUE),
  ('Barangay 703', '703', TRUE),
  ('Barangay 704', '704', TRUE),
  ('Barangay 705', '705', TRUE),
  ('Barangay 706', '706', TRUE),
  ('Barangay 707', '707', TRUE),
  ('Barangay 708', '708', TRUE),
  ('Barangay 709', '709', TRUE),
  ('Barangay 710', '710', TRUE),
  ('Barangay 711', '711', TRUE),
  ('Barangay 712', '712', TRUE),
  ('Barangay 713', '713', TRUE),
  ('Barangay 714', '714', TRUE),
  ('Barangay 715', '715', TRUE),
  ('Barangay 716', '716', TRUE),
  ('Barangay 717', '717', TRUE),
  ('Barangay 718', '718', TRUE),
  ('Barangay 719', '719', TRUE),
  ('Barangay 720', '720', TRUE)
ON DUPLICATE KEY UPDATE is_participating = TRUE;

-- ─── STREETS ─────────────────────────────────────────────────────────────────
-- 20 real Malate streets, assigned evenly (2 each) across Barangays 701–710.
-- Joined by barangay_name rather than hardcoded IDs so this also works on
-- databases where BARANGAYS already had rows (AUTO_INCREMENT offset).
INSERT IGNORE INTO STREETS (barangay_id, street_name, is_active)
SELECT b.barangay_id, s.street_name, TRUE
FROM (
  SELECT 'Barangay 701' AS barangay_name, 'Adriatico Street'               AS street_name
  UNION ALL SELECT 'Barangay 701', 'Remedios Street'
  UNION ALL SELECT 'Barangay 702', 'M.H. Del Pilar Street'
  UNION ALL SELECT 'Barangay 702', 'Mabini Street'
  UNION ALL SELECT 'Barangay 703', 'J. Bocobo Street'
  UNION ALL SELECT 'Barangay 703', 'Nakpil Street'
  UNION ALL SELECT 'Barangay 704', 'Orosa Street'
  UNION ALL SELECT 'Barangay 704', 'Julio Nakpil Street'
  UNION ALL SELECT 'Barangay 705', 'Leveriza Street'
  UNION ALL SELECT 'Barangay 705', 'Pablo Ocampo Street'
  UNION ALL SELECT 'Barangay 706', 'Pedro Gil Street'
  UNION ALL SELECT 'Barangay 706', 'Taft Avenue'
  UNION ALL SELECT 'Barangay 707', 'Vito Cruz Street'
  UNION ALL SELECT 'Barangay 707', 'UN Avenue'
  UNION ALL SELECT 'Barangay 708', 'Kalaw Avenue'
  UNION ALL SELECT 'Barangay 708', 'Roxas Boulevard (service road)'
  UNION ALL SELECT 'Barangay 709', 'Agno Street'
  UNION ALL SELECT 'Barangay 709', 'Dominga Street'
  UNION ALL SELECT 'Barangay 710', 'Singalong Street'
  UNION ALL SELECT 'Barangay 710', 'General Luna Street'
) s
JOIN BARANGAYS b ON b.barangay_name = s.barangay_name;

-- ─── PENALTY_TIERS ───────────────────────────────────────────────────────────
-- Tiers are matched by comparing vehicle.total_violations against
-- min_violations/max_violations at the time a report is verified.
-- No unique key on tier_name, so insert-if-missing then normalize values.
INSERT INTO PENALTY_TIERS (tier_name, min_violations, max_violations, fine_amount, requires_clamping)
SELECT '1st Offense', 0, 1, 900.00, FALSE
WHERE NOT EXISTS (SELECT 1 FROM PENALTY_TIERS WHERE tier_name = '1st Offense');

INSERT INTO PENALTY_TIERS (tier_name, min_violations, max_violations, fine_amount, requires_clamping)
SELECT '2nd Offense', 2, 2, 1800.00, FALSE
WHERE NOT EXISTS (SELECT 1 FROM PENALTY_TIERS WHERE tier_name = '2nd Offense');

INSERT INTO PENALTY_TIERS (tier_name, min_violations, max_violations, fine_amount, requires_clamping)
SELECT '3rd Offense+', 3, NULL, 3600.00, TRUE
WHERE NOT EXISTS (SELECT 1 FROM PENALTY_TIERS WHERE tier_name = '3rd Offense+');

UPDATE PENALTY_TIERS SET min_violations = 0, max_violations = 1,    fine_amount = 900.00,  requires_clamping = FALSE WHERE tier_name = '1st Offense';
UPDATE PENALTY_TIERS SET min_violations = 2, max_violations = 2,    fine_amount = 1800.00, requires_clamping = FALSE WHERE tier_name = '2nd Offense';
UPDATE PENALTY_TIERS SET min_violations = 3, max_violations = NULL, fine_amount = 3600.00, requires_clamping = TRUE  WHERE tier_name = '3rd Offense+';

-- ─── PARKING_RULES ───────────────────────────────────────────────────────────
-- Every street gets the full set of enforceable violation types as active
-- rules. NOT EXISTS keeps re-runs from duplicating (no unique key on
-- street_id + violation_type).
INSERT INTO PARKING_RULES (street_id, violation_type, is_active)
SELECT s.street_id, v.violation_type, TRUE
FROM STREETS s
CROSS JOIN (
  SELECT 'Wrong Side Parking' AS violation_type
  UNION ALL SELECT 'Parked on Sidewalk'
  UNION ALL SELECT 'Parked on Pedestrian Lane'
  UNION ALL SELECT 'Parked on Yellow Line'
  UNION ALL SELECT 'Double Parking'
  UNION ALL SELECT 'Parked in No Parking Zone'
  UNION ALL SELECT 'Blocking Driveway'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM PARKING_RULES p
  WHERE p.street_id = s.street_id AND p.violation_type = v.violation_type
);

SET FOREIGN_KEY_CHECKS = 1;
