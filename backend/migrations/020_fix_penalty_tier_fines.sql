-- Migration 020 — align penalty fines with MMDA MMTC 2023 (₱1000/₱2000/₱3000).
-- Placeholder amounts pending the MTPB stakeholder meeting; ranges and clamping
-- are unchanged.

UPDATE PENALTY_TIERS
   SET fine_amount = 1000.00
 WHERE tier_name = '1st Offense' OR (min_violations = 0 AND max_violations = 1);

UPDATE PENALTY_TIERS
   SET fine_amount = 2000.00
 WHERE tier_name = '2nd Offense' OR (min_violations = 2 AND max_violations = 2);

UPDATE PENALTY_TIERS
   SET fine_amount = 3000.00
 WHERE tier_name = '3rd Offense+' OR (min_violations = 3 AND max_violations IS NULL);
