-- Migration 004 — PENALTY_TIERS
-- DDL matches src/config/schema.sql exactly.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS PENALTY_TIERS (
  tier_id           INT           NOT NULL AUTO_INCREMENT,
  tier_name         VARCHAR(50)   NOT NULL,              -- e.g. '1st Offense', '2nd Offense'
  min_violations    INT           NOT NULL,              -- lower bound of violation count for this tier
  max_violations    INT,                                 -- upper bound; NULL = no ceiling
  fine_amount       DECIMAL(10,2) NOT NULL,              -- PHP
  requires_clamping BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
