-- mig029: add plate_type to VIOLATION_REPORTS to distinguish regular LTO plates,
-- conduction sticker / temporary plates (CS-XXXX prefix), and vehicles with no
-- plate number at all (synthetic NOPLATE_ identifier). Existing rows default to
-- 'regular'. VEHICLES.plate_number already stores the full value (CS-... or
-- NOPLATE_...) so no vehicle-table change is needed.
ALTER TABLE VIOLATION_REPORTS
  ADD COLUMN plate_type ENUM('regular','conduction','no_plate') NOT NULL DEFAULT 'regular'
  AFTER violation_type;
