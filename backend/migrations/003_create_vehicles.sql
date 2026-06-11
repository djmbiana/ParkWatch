-- Migration 003 — VEHICLES
-- DDL matches src/config/schema.sql exactly.
-- (USERS is intentionally absent from /migrations — it was created in
-- Sprint 1 and its migration must not be modified.)

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS VEHICLES (
  vehicle_id         INT         NOT NULL AUTO_INCREMENT,
  plate_number       VARCHAR(20) NOT NULL,
  vehicle_type       ENUM('car','motorcycle','truck','van','jeepney','tricycle','other')
                       NOT NULL DEFAULT 'car',           -- [ext] not in ERD; useful for reporting
  color              VARCHAR(30),                        -- [ext] optional visual aid
  total_violations   INT         NOT NULL DEFAULT 0,     -- maintained by app on report resolution
  is_repeat_offender BOOLEAN     NOT NULL DEFAULT FALSE, -- maintained by app (true when total_violations >= 2)
  first_recorded_at  DATETIME,
  created_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (vehicle_id),
  UNIQUE KEY uq_vehicles_plate (plate_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
