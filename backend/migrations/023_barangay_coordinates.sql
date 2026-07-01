-- Migration 023 — barangay centroid coordinates for the barangay-level heat map.
--
-- The violation density map plots one point per barangay at its centroid (rather
-- than per-street), because Manila street names repeat across the city and exact
-- barangay boundaries aren't published — so per-street coordinates were unreliable.
-- Centroids are seeded from OpenStreetMap (see seeds/seed.js PARTNER_BARANGAYS).

ALTER TABLE BARANGAYS
  ADD COLUMN latitude  DECIMAL(10, 7) NULL AFTER is_participating,
  ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;
