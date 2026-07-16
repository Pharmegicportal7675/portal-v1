-- Remove unused client CC emails/phones fields from the portal.
-- Safe to re-run on MariaDB (skips if columns already dropped).
ALTER TABLE clients
  DROP COLUMN IF EXISTS cc_emails,
  DROP COLUMN IF EXISTS cc_phones;
