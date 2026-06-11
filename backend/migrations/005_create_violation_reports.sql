-- Migration 005 — VIOLATION_REPORTS (references USERS, VEHICLES, STREETS,
-- BARANGAYS, PENALTY_TIERS). USERS must already exist (created in Sprint 1).
-- DDL matches src/config/schema.sql exactly.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS VIOLATION_REPORTS (
  report_id           INT           NOT NULL AUTO_INCREMENT,
  citizen_id          INT,                               -- reporter (NULL = anonymous submission)
  vehicle_id          INT,                               -- resolved after OCR/manual plate match
  street_id           INT,
  barangay_id         INT,                               -- [ext] denormalized from street for faster queries
  violation_type      VARCHAR(100),
  photo_path          VARCHAR(300),                      -- GCS object path, e.g. gs://bucket/reports/uuid.jpg
  ocr_raw_response    TEXT,                              -- full JSON from Google Cloud Vision API
  ocr_extracted_plate VARCHAR(20),                       -- plate text extracted by OCR
  ocr_confidence_score DECIMAL(5,2),                     -- Vision API confidence 0.00–100.00
  manual_plate_input  VARCHAR(20),                       -- citizen-typed plate (fallback / override)
  penalty_tier_id     INT,                               -- assigned after verification
  status              ENUM('pending','verified','acknowledged','dispatched','resolved','rejected')
                        NOT NULL DEFAULT 'pending',
  resolution_outcome  VARCHAR(255),                      -- notes on how it was resolved
  rejection_reason    VARCHAR(255),
  verified_by         INT,                               -- MTPB/brgy user who verified the report
  assigned_officer_id INT,                               -- MTPB officer dispatched to the scene
  is_escalated        BOOLEAN       NOT NULL DEFAULT FALSE,
  ticket_reference    VARCHAR(100),                      -- physical ticket number once issued
  submitted_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at         DATETIME,
  acknowledged_at     DATETIME,
  dispatched_at       DATETIME,
  escalated_at        DATETIME,
  resolved_at         DATETIME,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  CONSTRAINT fk_reports_citizen
    FOREIGN KEY (citizen_id)          REFERENCES USERS (user_id)           ON DELETE SET NULL,
  CONSTRAINT fk_reports_vehicle
    FOREIGN KEY (vehicle_id)          REFERENCES VEHICLES (vehicle_id)     ON DELETE SET NULL,
  CONSTRAINT fk_reports_street
    FOREIGN KEY (street_id)           REFERENCES STREETS (street_id)       ON DELETE SET NULL,
  CONSTRAINT fk_reports_barangay
    FOREIGN KEY (barangay_id)         REFERENCES BARANGAYS (barangay_id)   ON DELETE SET NULL,
  CONSTRAINT fk_reports_penalty_tier
    FOREIGN KEY (penalty_tier_id)     REFERENCES PENALTY_TIERS (tier_id)   ON DELETE SET NULL,
  CONSTRAINT fk_reports_verified_by
    FOREIGN KEY (verified_by)         REFERENCES USERS (user_id)           ON DELETE SET NULL,
  CONSTRAINT fk_reports_officer
    FOREIGN KEY (assigned_officer_id) REFERENCES USERS (user_id)           ON DELETE SET NULL,
  INDEX idx_reports_status          (status),
  INDEX idx_reports_submitted_at    (submitted_at),
  INDEX idx_reports_citizen         (citizen_id),
  INDEX idx_reports_ocr_plate       (ocr_extracted_plate),
  INDEX idx_reports_manual_plate    (manual_plate_input)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
