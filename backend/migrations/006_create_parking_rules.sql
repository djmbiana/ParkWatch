-- Migration 006 — PARKING_RULES (references STREETS)
-- DDL matches src/config/schema.sql exactly.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS PARKING_RULES (
  rule_id        INT          NOT NULL AUTO_INCREMENT,
  street_id      INT          NOT NULL,
  violation_type VARCHAR(100) NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id),
  CONSTRAINT fk_rules_street
    FOREIGN KEY (street_id) REFERENCES STREETS (street_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
