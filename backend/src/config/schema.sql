-- =============================================================================
-- ParkWatch — Database Schema (MySQL 8.0)
-- OCR-Assisted Citizen Parking Violation Reporting System, Malate District, Manila
--
-- Tables are declared in dependency order so foreign keys resolve cleanly:
--   BARANGAYS -> STREETS -> USERS -> VEHICLES -> PENALTY_TIERS
--   -> VIOLATION_REPORTS -> PARKING_RULES -> NOTIFICATION_LOG
--
-- This file is run inside the target database. Under docker-compose the MySQL
-- image selects MYSQL_DATABASE automatically before executing init scripts.
-- =============================================================================

SET NAMES utf8mb4;

-- ─── 1. BARANGAYS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS BARANGAYS (
  barangay_id    INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  district       VARCHAR(100) NOT NULL DEFAULT 'Malate',
  city           VARCHAR(100) NOT NULL DEFAULT 'Manila',
  contact_number VARCHAR(20),
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_barangay_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. STREETS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS STREETS (
  street_id          INT AUTO_INCREMENT PRIMARY KEY,
  barangay_id        INT NOT NULL,
  name               VARCHAR(150) NOT NULL,
  is_no_parking_zone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_streets_barangay
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS (barangay_id) ON DELETE CASCADE,
  UNIQUE KEY uq_street_per_barangay (barangay_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. USERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS USERS (
  user_id         INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  password_hash   CHAR(60) NOT NULL,                      -- bcrypt hash (always 60 chars)
  full_name       VARCHAR(150),
  phone_number    VARCHAR(20),
  role            ENUM('citizen','brgy_official','mtpb_officer','mtpb_supervisor','admin')
                    NOT NULL DEFAULT 'citizen',
  anonymous_alias VARCHAR(50),                            -- public-facing handle for citizen reporters
  barangay_id     INT,                                    -- assigned barangay (officials/officers)
  fcm_token       VARCHAR(255),                           -- Firebase Cloud Messaging device token
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_barangay
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS (barangay_id) ON DELETE SET NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_alias (anonymous_alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. VEHICLES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS VEHICLES (
  vehicle_id         INT AUTO_INCREMENT PRIMARY KEY,
  plate_number       VARCHAR(20) NOT NULL,
  vehicle_type       ENUM('car','motorcycle','truck','van','jeepney','tricycle','other')
                       NOT NULL DEFAULT 'car',
  make               VARCHAR(50),
  model              VARCHAR(50),
  color              VARCHAR(30),
  total_violations   INT NOT NULL DEFAULT 0,
  is_repeat_offender BOOLEAN NOT NULL DEFAULT FALSE,
  first_reported_at  TIMESTAMP NULL DEFAULT NULL,
  last_reported_at   TIMESTAMP NULL DEFAULT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehicles_plate (plate_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. PENALTY_TIERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS PENALTY_TIERS (
  penalty_tier_id INT AUTO_INCREMENT PRIMARY KEY,
  tier_name       VARCHAR(50) NOT NULL,                   -- e.g. '1st Offense'
  offense_number  INT NOT NULL,                           -- 1, 2, 3, ...
  fine_amount     DECIMAL(10,2) NOT NULL,                 -- PHP
  description     VARCHAR(255),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_penalty_offense_number (offense_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6. VIOLATION_REPORTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS VIOLATION_REPORTS (
  report_id           INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id         INT,                                -- citizen who filed it
  vehicle_id          INT,                                -- resolved vehicle (null until matched)
  barangay_id         INT,                                -- where the violation occurred
  street_id           INT,                                -- where the violation occurred
  penalty_tier_id     INT,                                -- assigned tier (null until verified)
  assigned_officer_id INT,                                -- MTPB officer handling the report
  ocr_extracted_plate VARCHAR(20),                        -- plate read by Google Cloud Vision
  ocr_confidence      DECIMAL(5,2),                       -- OCR confidence 0.00–100.00
  manual_plate_input  VARCHAR(20),                        -- citizen-typed plate (fallback/override)
  final_plate_number  VARCHAR(20),                        -- confirmed plate used for matching
  evidence_photo_url  VARCHAR(512),                       -- Google Cloud Storage object URL
  violation_type      VARCHAR(100),                       -- e.g. 'No Parking Zone'
  description         TEXT,
  latitude            DECIMAL(10,7),
  longitude           DECIMAL(10,7),
  status              ENUM('pending','verified','acknowledged','dispatched','resolved','rejected')
                        NOT NULL DEFAULT 'pending',
  is_escalated        BOOLEAN NOT NULL DEFAULT FALSE,
  rejection_reason    VARCHAR(255),
  reported_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at         TIMESTAMP NULL DEFAULT NULL,
  resolved_at         TIMESTAMP NULL DEFAULT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_reporter
    FOREIGN KEY (reporter_id) REFERENCES USERS (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES VEHICLES (vehicle_id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_barangay
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS (barangay_id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_street
    FOREIGN KEY (street_id) REFERENCES STREETS (street_id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_penalty_tier
    FOREIGN KEY (penalty_tier_id) REFERENCES PENALTY_TIERS (penalty_tier_id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_officer
    FOREIGN KEY (assigned_officer_id) REFERENCES USERS (user_id) ON DELETE SET NULL,
  INDEX idx_reports_status (status),
  INDEX idx_reports_reported_at (reported_at),
  INDEX idx_reports_final_plate (final_plate_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7. PARKING_RULES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS PARKING_RULES (
  rule_id          INT AUTO_INCREMENT PRIMARY KEY,
  barangay_id      INT,                                   -- null = applies district-wide
  street_id        INT,                                   -- null = applies barangay-wide
  rule_name        VARCHAR(150) NOT NULL,
  description      TEXT,
  no_parking_start TIME NULL DEFAULT NULL,                -- null = all day
  no_parking_end   TIME NULL DEFAULT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rules_barangay
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS (barangay_id) ON DELETE CASCADE,
  CONSTRAINT fk_rules_street
    FOREIGN KEY (street_id) REFERENCES STREETS (street_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 8. NOTIFICATION_LOG ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS NOTIFICATION_LOG (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT,                                    -- recipient
  report_id       INT,                                    -- related violation report
  title           VARCHAR(150) NOT NULL,
  body            VARCHAR(500) NOT NULL,
  type            ENUM('report_status','escalation','assignment','system')
                    NOT NULL DEFAULT 'system',
  channel         ENUM('fcm','sms','email') NOT NULL DEFAULT 'fcm',
  status          ENUM('queued','sent','delivered','failed') NOT NULL DEFAULT 'queued',
  error_message   VARCHAR(255),
  sent_at         TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notiflog_user
    FOREIGN KEY (user_id) REFERENCES USERS (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_notiflog_report
    FOREIGN KEY (report_id) REFERENCES VIOLATION_REPORTS (report_id) ON DELETE SET NULL,
  INDEX idx_notiflog_user (user_id),
  INDEX idx_notiflog_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
