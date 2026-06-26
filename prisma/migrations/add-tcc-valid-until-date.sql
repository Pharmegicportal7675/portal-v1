-- Persist admin-edited "Valid upto" on TCC applications (run once on live DB).
ALTER TABLE tcc_applications
  ADD COLUMN certificate_valid_until_date DATE NULL AFTER certificate_issue_date;
