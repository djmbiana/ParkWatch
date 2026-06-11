-- Migration 002 — STREETS (references BARANGAYS)
-- DDL matches src/config/schema.sql exactly.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS STREETS (
  street_id   INT          NOT NULL AUTO_INCREMENT,
  barangay_id INT          NOT NULL,
  street_name VARCHAR(100) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (street_id),
  CONSTRAINT fk_streets_barangay
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS (barangay_id) ON DELETE CASCADE,
  UNIQUE KEY uq_street_per_barangay (barangay_id, street_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
