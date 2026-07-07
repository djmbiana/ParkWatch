-- Migration 033: Force first-login password change for admin-provisioned accounts.
-- Adds must_change_password flag to USERS. Set to TRUE by createUser (admin
-- provisioning); cleared to FALSE when the user changes their password via
-- POST /api/v1/auth/change-password.

-- ADD COLUMN IF NOT EXISTS isn't supported in MySQL 5.7; use a conditional via procedure.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'USERS'
    AND COLUMN_NAME  = 'must_change_password'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE USERS ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
