-- Migration 028: audit_logs table
-- Records every create/update/delete operation with the acting user,
-- their group at the time, before/after JSON snapshots, and IP address.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INT           NOT NULL AUTO_INCREMENT,
  user_id       INT,
  group_id      INT,
  module_name   VARCHAR(50)   NOT NULL,
  function_name VARCHAR(50)   NOT NULL,
  action_type   ENUM('create','read','update','delete') NOT NULL,
  target_table  VARCHAR(100),
  target_id     VARCHAR(100),
  before_value  JSON,
  after_value   JSON,
  ip_address    VARCHAR(45),
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_user    (user_id),
  INDEX idx_audit_module  (module_name),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
