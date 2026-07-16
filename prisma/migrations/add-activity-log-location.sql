-- Adds IP + approximate place for Activity Log audit trail.
-- Safe to re-run on MariaDB (skips if columns already exist).
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL AFTER metadata,
  ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL AFTER ip_address;
