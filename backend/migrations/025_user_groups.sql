-- Migration 025: RBAC user groups table
-- Groups replace flat role-based permission checks with a flexible,
-- permission-matrix-driven model. The is_system_role flag protects
-- the Super Admin group from deletion or demotion.

CREATE TABLE IF NOT EXISTS user_groups (
  id             INT           NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100)  NOT NULL,
  description    VARCHAR(255),
  is_system_role BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
