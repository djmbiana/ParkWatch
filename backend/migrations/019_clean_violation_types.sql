-- Migration 019 — normalize PARKING_RULES to the canonical 10 violation types
-- (RA 4136 + MMDA MMTC 2023). The earlier seed had inconsistent naming
-- ("No Parking Zone" vs "Parked in No Parking Zone", "Parking on Sidewalk" vs
-- "Parked on Sidewalk") and an extra non-paper type ("Obstruction of Traffic").
-- Safe to rebuild: PARKING_RULES is reference/seed data.

DELETE FROM PARKING_RULES;

INSERT INTO PARKING_RULES (street_id, violation_type, is_active)
SELECT s.street_id, v.violation_type, TRUE
FROM STREETS s
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
) v
WHERE s.is_active IS NULL OR s.is_active = TRUE;
