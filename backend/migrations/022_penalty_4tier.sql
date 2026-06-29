-- Migration 022 — 4-tier penalty structure with enforcement actions.
--
-- The penalty model becomes:
--   1st Offense — Verbal Warning  (no fine)
--   2nd Offense — Ticket          (fine)
--   3rd Offense — Wheel Clamp     (fine, requires_clamping)
--   4th Offense — Impound         (fine, requires_impound)
--
-- Adds the enforcement_action label and a requires_impound flag (requires_clamping
-- already exists). The tier ROWS themselves are (re)written by the seed, which is
-- the single source of truth for reference data — see seeds/seed.js.

ALTER TABLE PENALTY_TIERS
  ADD COLUMN enforcement_action VARCHAR(50) NULL AFTER tier_name,
  ADD COLUMN requires_impound   BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_clamping;
