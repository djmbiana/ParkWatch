-- Migration 026: permissions + group_permissions tables
-- permissions rows are function-level for users_mgt (edit_profile,
-- reset_password, status_update) and module-level (single "manage"
-- function) for all other modules.

CREATE TABLE IF NOT EXISTS permissions (
  id            INT          NOT NULL AUTO_INCREMENT,
  module_name   VARCHAR(50)  NOT NULL,
  function_name VARCHAR(50)  NOT NULL,
  description   VARCHAR(255),
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perm_module_func (module_name, function_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_permissions (
  id            INT     NOT NULL AUTO_INCREMENT,
  group_id      INT     NOT NULL,
  permission_id INT     NOT NULL,
  can_create    BOOLEAN NOT NULL DEFAULT FALSE,
  can_read      BOOLEAN NOT NULL DEFAULT FALSE,
  can_update    BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete    BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gp_group_perm (group_id, permission_id),
  CONSTRAINT fk_gp_group
    FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
