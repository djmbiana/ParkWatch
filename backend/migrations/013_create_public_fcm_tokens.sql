-- Migration 013 — PUBLIC_FCM_TOKENS.
--
-- Anonymous citizens (no account, per paper p.118) register their device's FCM
-- token here so the app can later receive push notifications without a USERS
-- row. token_id is the surrogate key referenced by VIOLATION_REPORTS.fcm_token_id
-- (migration 015); token_hash gives an indexable unique key for upserts (token
-- strings exceed the utf8mb4 index-length limit), with the full token kept for
-- sending.

CREATE TABLE IF NOT EXISTS PUBLIC_FCM_TOKENS (
  token_id     INT          NOT NULL AUTO_INCREMENT,
  token_hash   CHAR(64)     NOT NULL,            -- SHA2(token, 256)
  token        VARCHAR(512) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_fcm_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
