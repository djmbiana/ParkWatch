-- Migration 001 — BARANGAYS
-- DDL matches src/config/schema.sql (the project data dictionary) exactly.
-- Idempotent: CREATE TABLE IF NOT EXISTS is a no-op on databases already
-- initialized by docker-entrypoint-initdb.d/01-schema.sql.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS BARANGAYS (
  barangay_id      INT          NOT NULL AUTO_INCREMENT,
  barangay_name    VARCHAR(100) NOT NULL,
  barangay_number  VARCHAR(10),
  is_participating BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (barangay_id),
  UNIQUE KEY uq_barangay_name (barangay_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
