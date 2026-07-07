-- Migration 035: Add description and ordinance to PARKING_RULES.
-- Descriptions are plain-language explanations of each violation.
-- Ordinances cite the verified official Philippine legal basis:
--   R.A. No. 4136 Sec. 46 — Land Transportation and Traffic Code
--   R.A. No. 9514        — Revised Fire Code of the Philippines
--   MMC Res. No. 23-02, S. 2023 — Metro Manila Traffic Code of 2023

ALTER TABLE PARKING_RULES
  ADD COLUMN description VARCHAR(300) NULL AFTER violation_type,
  ADD COLUMN ordinance   VARCHAR(200) NULL AFTER description;

-- Back-fill the 10 canonical violation types with verified legal citations.
UPDATE PARKING_RULES SET
  description = 'Vehicle parked on a pedestrian sidewalk or path not intended for vehicular use, obstructing pedestrian flow.',
  ordinance   = 'R.A. No. 4136, Sec. 46; MMC Res. No. 23-02, S. 2023'
WHERE violation_type = 'Parked on Sidewalk';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked on a marked pedestrian crossing (crosswalk/zebra zone), preventing pedestrians from safely crossing.',
  ordinance   = 'R.A. No. 4136, Sec. 46(b)'
WHERE violation_type = 'Parked on Pedestrian Lane';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked along road sections marked with yellow lines, which designate restricted or no-parking zones.',
  ordinance   = 'MMC Res. No. 23-02, S. 2023 (Metro Manila Traffic Code of 2023)'
WHERE violation_type = 'Parked on Yellow Line';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked in an area where official no-parking signs or markings have been erected by the authority.',
  ordinance   = 'R.A. No. 4136, Sec. 46(h); MMC Res. No. 23-02, S. 2023'
WHERE violation_type = 'Parked in No Parking Zone';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked on the roadway side of another vehicle already stopped or parked at the curb (parallel double-parking).',
  ordinance   = 'R.A. No. 4136, Sec. 46(g); MMC Res. No. 23-02, S. 2023'
WHERE violation_type = 'Double Parking';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked in front of a private driveway, garage, or building entrance, blocking ingress and egress.',
  ordinance   = 'R.A. No. 4136, Sec. 46(f)'
WHERE violation_type = 'Blocking Driveway or Entrance';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked facing oncoming traffic or against the designated direction of traffic flow on a one-way or two-way road.',
  ordinance   = 'R.A. No. 4136, Sec. 45; MMC Res. No. 23-02, S. 2023'
WHERE violation_type = 'Wrong Side Parking';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked within six (6) meters of the intersection of curb lines at a street corner.',
  ordinance   = 'R.A. No. 4136, Sec. 46(a), (c)'
WHERE violation_type = 'Parked at Intersection or Corner';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked within four (4) meters of a fire hydrant, obstructing emergency firefighting access.',
  ordinance   = 'R.A. No. 4136, Sec. 46(e); R.A. No. 9514 (Revised Fire Code), Sec. 7'
WHERE violation_type = 'Parked in Front of Fire Hydrant';

UPDATE PARKING_RULES SET
  description = 'Vehicle parked in a designated public utility vehicle (bus or jeepney) loading and unloading zone.',
  ordinance   = 'MMC Res. No. 23-02, S. 2023 (Metro Manila Traffic Code of 2023); R.A. No. 4136, Sec. 46(h)'
WHERE violation_type = 'Parked in Bus or Jeepney Stop Zone';
