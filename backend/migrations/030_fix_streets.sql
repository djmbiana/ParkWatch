-- mig030: clean up test streets and fix incorrect barangay assignments.
--
-- During early testing, streets were created with wrong barangay_ids (some
-- ended up all under Barangay 726, and ad-hoc test streets were added).
-- This migration:
--   1. Deletes every street NOT in the official partner-barangay list
--      (PARKING_RULES cascade-deletes automatically via ON DELETE CASCADE).
--   2. Re-inserts any missing official streets under the correct barangay
--      (idempotent — uses INSERT IGNORE on the unique key).
--   3. Seeds the canonical 10 parking rules for any streets that have none.
--
-- VIOLATION_REPORTS rows that referenced deleted streets will have
-- street_id set to NULL (ON DELETE SET NULL on the reports FK).

-- ── Step 1: remove streets that do not match the official list ────────────────
-- Keep a street only when its (barangay_number, street_name) appears in the
-- authoritative mapping below. Everything else — including test streets and
-- streets filed under the wrong barangay — is deleted.
DELETE s
FROM STREETS s
JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
WHERE NOT EXISTS (
  SELECT 1
  FROM (
    SELECT 726 AS brgy_num, 'Cong A. Francisco Street'  AS sname UNION ALL
    SELECT 726,              'J.B. Roxas Street'                  UNION ALL
    SELECT 726,              'Maligaya Street'                    UNION ALL
    SELECT 726,              'Singalong Street'                   UNION ALL
    SELECT 727,              'Captain Ticong Street'              UNION ALL
    SELECT 727,              'Dagonoy Street'                     UNION ALL
    SELECT 727,              'Del Carmen Street'                  UNION ALL
    SELECT 727,              'Don Ysidro Street'                  UNION ALL
    SELECT 727,              'Leon Guinto Street'                 UNION ALL
    SELECT 729,              'Daang Radayal Blg.2'                UNION ALL
    SELECT 729,              'Pablo Ocampo Street'                UNION ALL
    SELECT 729,              'Sandejas Street'                    UNION ALL
    SELECT 730,              'Dominga Street'                     UNION ALL
    SELECT 730,              'Tramo Street'                       UNION ALL
    SELECT 730,              'Villarel Street'                    UNION ALL
    SELECT 762,              'Arellano Street'                    UNION ALL
    SELECT 762,              'Bautista Street'                    UNION ALL
    SELECT 762,              'C.Ayala Street'                     UNION ALL
    SELECT 762,              'Consuelo Street'                    UNION ALL
    SELECT 762,              'Don Pedro Street'                   UNION ALL
    SELECT 762,              'Pablo Ocampo Street'
  ) AS official
  WHERE official.brgy_num = b.barangay_number
    AND official.sname     = s.street_name
);

-- ── Step 2: insert any missing official streets ───────────────────────────────
INSERT IGNORE INTO STREETS (barangay_id, street_name, is_active)
SELECT b.barangay_id, official.sname, TRUE
FROM (
  SELECT 726 AS brgy_num, 'Cong A. Francisco Street'  AS sname UNION ALL
  SELECT 726,              'J.B. Roxas Street'                  UNION ALL
  SELECT 726,              'Maligaya Street'                    UNION ALL
  SELECT 726,              'Singalong Street'                   UNION ALL
  SELECT 727,              'Captain Ticong Street'              UNION ALL
  SELECT 727,              'Dagonoy Street'                     UNION ALL
  SELECT 727,              'Del Carmen Street'                  UNION ALL
  SELECT 727,              'Don Ysidro Street'                  UNION ALL
  SELECT 727,              'Leon Guinto Street'                 UNION ALL
  SELECT 729,              'Daang Radayal Blg.2'                UNION ALL
  SELECT 729,              'Pablo Ocampo Street'                UNION ALL
  SELECT 729,              'Sandejas Street'                    UNION ALL
  SELECT 730,              'Dominga Street'                     UNION ALL
  SELECT 730,              'Tramo Street'                       UNION ALL
  SELECT 730,              'Villarel Street'                    UNION ALL
  SELECT 762,              'Arellano Street'                    UNION ALL
  SELECT 762,              'Bautista Street'                    UNION ALL
  SELECT 762,              'C.Ayala Street'                     UNION ALL
  SELECT 762,              'Consuelo Street'                    UNION ALL
  SELECT 762,              'Don Pedro Street'                   UNION ALL
  SELECT 762,              'Pablo Ocampo Street'
) AS official
JOIN BARANGAYS b ON b.barangay_number = official.brgy_num;

-- ── Step 3: seed the 10 canonical parking rules for streets that have none ────
INSERT INTO PARKING_RULES (street_id, violation_type, is_active)
SELECT s.street_id, v.violation_type, TRUE
FROM STREETS s
JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
CROSS JOIN (
  SELECT 'Parked on Sidewalk'                  AS violation_type UNION ALL
  SELECT 'Parked on Pedestrian Lane'                             UNION ALL
  SELECT 'Parked on Yellow Line'                                 UNION ALL
  SELECT 'Parked in No Parking Zone'                             UNION ALL
  SELECT 'Double Parking'                                        UNION ALL
  SELECT 'Blocking Driveway or Entrance'                         UNION ALL
  SELECT 'Wrong Side Parking'                                    UNION ALL
  SELECT 'Parked at Intersection or Corner'                      UNION ALL
  SELECT 'Parked in Front of Fire Hydrant'                       UNION ALL
  SELECT 'Parked in Bus or Jeepney Stop Zone'
) AS v
WHERE b.barangay_number IN (726, 727, 729, 730, 762)
  AND NOT EXISTS (
    SELECT 1 FROM PARKING_RULES pr
    WHERE pr.street_id = s.street_id
      AND pr.violation_type = v.violation_type
  );
