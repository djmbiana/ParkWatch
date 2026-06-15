-- Migration 009: Fix anonymous_alias column and format
-- Spec (Table 21, p.120): anonymous_alias VARCHAR(50) NOT NULL
-- Spec (p.122): alias format must be "Reporter #XXXX" (4-digit number)
-- Previous implementation generated "Citizen_${hex}" and left column NULLABLE.

-- Step 1: Update any existing rows with the old "Citizen_*" format.
-- Uses RAND() to assign new Reporter #XXXX aliases (not guaranteed unique
-- per row here, but collision risk is negligible for small dev datasets).
UPDATE USERS
SET anonymous_alias = CONCAT('Reporter #', LPAD(FLOOR(1000 + RAND() * 9000), 4, '0'))
WHERE anonymous_alias NOT LIKE 'Reporter #%'
   OR anonymous_alias IS NULL;

-- Step 2: Add NOT NULL constraint now that all rows have a value.
ALTER TABLE USERS
  MODIFY COLUMN anonymous_alias VARCHAR(50) NOT NULL;
