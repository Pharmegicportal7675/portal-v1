-- Store export tonnage to 6 decimal places (for example 1.00056) and keep quota math at the same scale.
-- Safe to run more than once (MariaDB MODIFY to the same type is a no-op).
ALTER TABLE chemicals
  MODIFY available_quantity DECIMAL(16, 6) NOT NULL DEFAULT 0.000000,
  MODIFY exported_quantity DECIMAL(16, 6) NOT NULL DEFAULT 0.000000;

ALTER TABLE client_chemicals
  MODIFY available_quantity DECIMAL(16, 6) NOT NULL DEFAULT 0.000000;

ALTER TABLE tcc_applications
  MODIFY quantity_mt DECIMAL(16, 6) NOT NULL;

ALTER TABLE quota_transactions
  MODIFY quantity_mt DECIMAL(16, 6) NOT NULL;
