-- Flags a substance as an intermediate substance (adds a note line on its CT/TCC certificates).
-- Safe to run more than once on the live DB (MariaDB) — skips if the column already exists.
ALTER TABLE chemicals
  ADD COLUMN IF NOT EXISTS is_intermediate_substance TINYINT(1) NOT NULL DEFAULT 0 AFTER tonnage_band;
