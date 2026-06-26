-- Incremental TCC application columns for existing live databases.
-- Safe to run once; skip any statement that reports "Duplicate column".

ALTER TABLE tcc_applications ADD COLUMN eu_importer_company_name VARCHAR(255) NULL;
ALTER TABLE tcc_applications ADD COLUMN eu_importer_address TEXT NULL;
ALTER TABLE tcc_applications ADD COLUMN purchase_order_number VARCHAR(255) NULL;
ALTER TABLE tcc_applications ADD COLUMN invoice_number VARCHAR(255) NULL;
ALTER TABLE tcc_applications ADD COLUMN regulatory_framework VARCHAR(255) NULL;
ALTER TABLE tcc_applications ADD COLUMN reach_certificate_id CHAR(36) NULL;
ALTER TABLE tcc_applications ADD COLUMN certificate_issue_date DATE NULL;
ALTER TABLE tcc_applications ADD COLUMN certificate_valid_until_date DATE NULL;
