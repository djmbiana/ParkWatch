-- Migration 016 — street coordinates for the violation density heat map.
--
-- The supervisor analytics screen plots a Leaflet/OpenStreetMap heat layer of
-- where violations cluster in Malate, weighted by report count per street.
-- Streets are a small fixed set, so we seed approximate Malate coordinates by
-- name here (idempotent — safe to re-run on existing data).

ALTER TABLE STREETS
  ADD COLUMN latitude  DECIMAL(10, 7) NULL AFTER street_name,
  ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;

-- Approximate Malate, Manila coordinates (good enough for a density heat map).
UPDATE STREETS SET latitude = 14.5685, longitude = 120.9868 WHERE street_name = 'Adriatico Street';
UPDATE STREETS SET latitude = 14.5668, longitude = 120.9882 WHERE street_name = 'Remedios Street';
UPDATE STREETS SET latitude = 14.5675, longitude = 120.9888 WHERE street_name = 'Nakpil Street';
UPDATE STREETS SET latitude = 14.5676, longitude = 120.9890 WHERE street_name = 'Julio Nakpil Street';
UPDATE STREETS SET latitude = 14.5702, longitude = 120.9838 WHERE street_name LIKE 'M.H.%Pilar Street';
UPDATE STREETS SET latitude = 14.5692, longitude = 120.9853 WHERE street_name = 'Mabini Street';
UPDATE STREETS SET latitude = 14.5662, longitude = 120.9942 WHERE street_name = 'Taft Avenue';
UPDATE STREETS SET latitude = 14.5762, longitude = 120.9872 WHERE street_name = 'Padre Faura Street';
UPDATE STREETS SET latitude = 14.5735, longitude = 120.9892 WHERE street_name = 'Pedro Gil Street';
UPDATE STREETS SET latitude = 14.5722, longitude = 120.9876 WHERE street_name LIKE '%Bocobo Street';
UPDATE STREETS SET latitude = 14.5642, longitude = 120.9932 WHERE street_name = 'San Andres Street';
UPDATE STREETS SET latitude = 14.5632, longitude = 120.9892 WHERE street_name = 'Quirino Avenue';
UPDATE STREETS SET latitude = 14.5736, longitude = 120.9902 WHERE street_name = 'Herran Street';
UPDATE STREETS SET latitude = 14.5746, longitude = 120.9866 WHERE street_name = 'Orosa Street';
UPDATE STREETS SET latitude = 14.5652, longitude = 120.9962 WHERE street_name = 'Leveriza Street';
UPDATE STREETS SET latitude = 14.5612, longitude = 120.9932 WHERE street_name = 'Pablo Ocampo Street';
UPDATE STREETS SET latitude = 14.5606, longitude = 120.9926 WHERE street_name = 'Vito Cruz Street';
UPDATE STREETS SET latitude = 14.5820, longitude = 120.9872 WHERE street_name = 'UN Avenue';
UPDATE STREETS SET latitude = 14.5800, longitude = 120.9822 WHERE street_name = 'Kalaw Avenue';
UPDATE STREETS SET latitude = 14.5700, longitude = 120.9792 WHERE street_name LIKE 'Roxas Boulevard%';
UPDATE STREETS SET latitude = 14.5626, longitude = 120.9946 WHERE street_name = 'Agno Street';
UPDATE STREETS SET latitude = 14.5636, longitude = 120.9952 WHERE street_name = 'Dominga Street';
UPDATE STREETS SET latitude = 14.5602, longitude = 120.9986 WHERE street_name = 'Singalong Street';
UPDATE STREETS SET latitude = 14.5758, longitude = 120.9852 WHERE street_name = 'General Luna Street';
