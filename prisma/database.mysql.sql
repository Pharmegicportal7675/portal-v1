-- Pharmegic Healthcare — MySQL schema (converted from database.sql)
-- Safe to re-run on empty database. Uses CREATE TABLE IF NOT EXISTS.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS admin_settings (
    id INT PRIMARY KEY DEFAULT 1,
    full_name VARCHAR(255) DEFAULT 'Admin User',
    mobile_number VARCHAR(255) DEFAULT '',
    email VARCHAR(255) DEFAULT 'directoratulpatoliya@gmail.com',
    cc_emails TEXT,
    bcc_emails TEXT,
    timezone VARCHAR(64) DEFAULT 'UTC',
    profile_image TEXT,
    smtp_host VARCHAR(255) DEFAULT '',
    smtp_port INT DEFAULT 587,
    smtp_user VARCHAR(255) DEFAULT '',
    smtp_pass VARCHAR(255) DEFAULT '',
    smtp_from VARCHAR(255) DEFAULT '',
    smtp_cc_default TEXT,
    rc_smtp_host VARCHAR(255) DEFAULT '',
    rc_smtp_port INT DEFAULT 587,
    rc_smtp_user VARCHAR(255) DEFAULT '',
    rc_smtp_pass VARCHAR(255) DEFAULT '',
    rc_smtp_from VARCHAR(255) DEFAULT '',
    rc_smtp_cc_default TEXT,
    tcc_application_notification_emails TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS clients (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    company_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    uuid_number VARCHAR(255) UNIQUE,
    registration_number VARCHAR(255),
    owner_name VARCHAR(255),
    address TEXT,
    city VARCHAR(255),
    state VARCHAR(255),
    postal_code VARCHAR(64),
    country VARCHAR(255) DEFAULT 'Turkey',
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(64),
    primary_contact_first_name VARCHAR(255),
    primary_contact_last_name VARCHAR(255),
    cc_emails TEXT,
    cc_phones TEXT,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
    regulatory_registrations JSON DEFAULT (JSON_ARRAY())
);

CREATE TABLE IF NOT EXISTS chemicals (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    chemical_name VARCHAR(255) NOT NULL,
    cas_number VARCHAR(64) NOT NULL UNIQUE,
    ec_number VARCHAR(64),
    tonnage_band VARCHAR(255),
    available_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    exported_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    validity_date DATE,
    status ENUM('active', 'inactive', 'trashed') DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_chemicals_available_qty CHECK (available_quantity >= 0),
    CONSTRAINT chk_chemicals_exported_qty CHECK (exported_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    login_password VARCHAR(255),
    role ENUM('SUPER_ADMIN', 'MASTER_ADMIN', 'CLIENT') NOT NULL DEFAULT 'CLIENT',
    client_id CHAR(36),
    is_disabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_contacts (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    role VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_contacts_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_chemicals (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    chemical_id CHAR(36) NOT NULL,
    available_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    validity_date DATE,
    registration_number VARCHAR(255),
    issued_date DATE,
    certificate_number VARCHAR(255),
    status ENUM('active', 'expired', 'suspended', 'trashed') NOT NULL DEFAULT 'active',
    assigned_by CHAR(36),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_client_chemical (client_id, chemical_id),
    CONSTRAINT fk_client_chemicals_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_chemicals_chemical FOREIGN KEY (chemical_id) REFERENCES chemicals(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_chemicals_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_client_chemicals_qty CHECK (available_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS tcc_applications (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    tracking_id VARCHAR(255) UNIQUE,
    client_id CHAR(36) NOT NULL,
    chemical_id CHAR(36) NOT NULL,
    client_chemical_id CHAR(36),
    reach_certificate_id CHAR(36),
    quantity_mt DECIMAL(12, 2) NOT NULL,
    export_date DATE,
    registration_number VARCHAR(255),
    remarks TEXT,
    bo_attachment_url TEXT,
    bo_attachment_name VARCHAR(255),
    eu_importer_company_name VARCHAR(255),
    eu_importer_address TEXT,
    purchase_order_number VARCHAR(255),
    invoice_number VARCHAR(255),
    regulatory_framework VARCHAR(255),
    certificate_issue_date DATE,
    certificate_valid_until_date DATE,
    status ENUM('pending', 'approved', 'rejected', 'changes_required', 'expired') DEFAULT 'pending',
    rejection_reason TEXT,
    approved_by CHAR(36),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tcc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_tcc_chemical FOREIGN KEY (chemical_id) REFERENCES chemicals(id) ON DELETE CASCADE,
    CONSTRAINT fk_tcc_client_chemical FOREIGN KEY (client_chemical_id) REFERENCES client_chemicals(id) ON DELETE SET NULL,
    CONSTRAINT fk_tcc_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_tcc_quantity CHECK (quantity_mt > 0)
);

CREATE TABLE IF NOT EXISTS certificates (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    certificate_number VARCHAR(255) NOT NULL UNIQUE,
    tcc_application_id CHAR(36) UNIQUE,
    client_id CHAR(36) NOT NULL,
    chemical_id CHAR(36),
    type VARCHAR(64) DEFAULT 'TCC',
    registration_number VARCHAR(255),
    file_url TEXT,
    allocated_quantity DECIMAL(12, 2),
    tonnage_band VARCHAR(255),
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    status ENUM('active', 'expired', 'revoked') DEFAULT 'active',
    mail_sent TINYINT(1) NOT NULL DEFAULT 0,
    mail_sent_at DATETIME,
    mail_sent_by CHAR(36),
    mail_resend_count INT NOT NULL DEFAULT 0,
    last_resend_at DATETIME,
    last_resend_by CHAR(36),
    mail_sent_history JSON NOT NULL DEFAULT (JSON_ARRAY()),
    created_by CHAR(36),
    updated_by CHAR(36),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_certificates_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_certificates_chemical FOREIGN KEY (chemical_id) REFERENCES chemicals(id) ON DELETE SET NULL,
    CONSTRAINT fk_certificates_tcc FOREIGN KEY (tcc_application_id) REFERENCES tcc_applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_certificates_mail_sent_by FOREIGN KEY (mail_sent_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_certificates_last_resend_by FOREIGN KEY (last_resend_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_certificates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_certificates_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE tcc_applications
    ADD CONSTRAINT fk_tcc_reach_certificate
    FOREIGN KEY (reach_certificate_id) REFERENCES certificates(id) ON DELETE SET NULL;

-- Run once on existing databases that pre-date certificate_valid_until_date:
-- ALTER TABLE tcc_applications ADD COLUMN certificate_valid_until_date DATE NULL AFTER certificate_issue_date;

CREATE TABLE IF NOT EXISTS quota_transactions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    chemical_id CHAR(36) NOT NULL,
    tcc_application_id CHAR(36),
    quantity_mt DECIMAL(12, 2) NOT NULL,
    transaction_type ENUM('deduct', 'restore', 'assign') NOT NULL,
    performed_by CHAR(36),
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_quota_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_quota_chemical FOREIGN KEY (chemical_id) REFERENCES chemicals(id) ON DELETE CASCADE,
    CONSTRAINT fk_quota_tcc FOREIGN KEY (tcc_application_id) REFERENCES tcc_applications(id) ON DELETE SET NULL,
    CONSTRAINT fk_quota_performed_by FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    `read` TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36),
    user_id CHAR(36),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255),
    entity_id VARCHAR(255),
    description TEXT,
    metadata JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255) NOT NULL,
    entity_id VARCHAR(255),
    metadata JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS internal_notes (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    author_id CHAR(36),
    note TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_internal_notes_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_internal_notes_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS templates (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    logo TEXT,
    accent_color VARCHAR(32) NOT NULL DEFAULT '#064e3b',
    footer_text TEXT,
    signature_image TEXT,
    rc_template_key VARCHAR(64) DEFAULT 'template_1',
    tcc_template_key VARCHAR(64) DEFAULT 'template_1',
    rc_logo TEXT,
    rc_signature_image TEXT,
    rc_accent_color VARCHAR(32) DEFAULT '#064e3b',
    rc_footer_text TEXT,
    tcc_logo TEXT,
    tcc_signature_image TEXT,
    tcc_accent_color VARCHAR(32) DEFAULT '#064e3b',
    tcc_footer_text TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_chemicals_cas ON chemicals(cas_number);
CREATE INDEX IF NOT EXISTS idx_client_chemicals_client ON client_chemicals(client_id);
CREATE INDEX IF NOT EXISTS idx_tcc_applications_client_id ON tcc_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_tcc_applications_status ON tcc_applications(status);
CREATE INDEX IF NOT EXISTS idx_certificates_client_id ON certificates(client_id);
CREATE INDEX IF NOT EXISTS idx_certificates_number ON certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_certificates_reach ON certificates(client_id, chemical_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, `read`);
CREATE INDEX IF NOT EXISTS idx_activity_logs_client ON activity_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_client ON quota_transactions(client_id);

SET FOREIGN_KEY_CHECKS = 1;

INSERT IGNORE INTO admin_settings (id, full_name, email)
VALUES (1, 'Admin User', 'directoratulpatoliya@gmail.com');

INSERT IGNORE INTO templates (id, accent_color, footer_text)
VALUES (
  'd4e30b6f-6c18-472e-8d8a-36fb644b9b94',
  '#064e3b',
  'Pharmegic Healthcare Compliance Division. For verification, scan the QR code.'
);

INSERT IGNORE INTO chemicals (id, chemical_name, cas_number, ec_number, tonnage_band, validity_date, available_quantity, exported_quantity, status)
VALUES
(UUID(), 'Ethylene Glycol Monoethyl Ether', '110-80-5', '203-804-1', '10-100 tonnes', '2027-12-31', 150.00, 25.50, 'active'),
(UUID(), 'N-Methyl-2-pyrrolidone (NMP)', '872-50-4', '212-828-1', '100-1000 tonnes', '2028-06-30', 800.00, 120.00, 'active'),
(UUID(), 'Trichloroethylene', '79-01-6', '201-167-4', '1-10 tonnes', '2026-12-31', 8.50, 1.20, 'active'),
(UUID(), 'Dimethylformamide (DMF)', '68-12-2', '200-679-5', '100-1000 tonnes', '2027-09-15', 500.00, 0.00, 'active');

INSERT IGNORE INTO users (id, email, password_hash, login_password, role, is_disabled)
VALUES
(UUID(), 'atul.patoliya@gmail.com', '$2b$12$nFbwz4f2OVFV.oISYd028emI1rdc58Zoi5BxRnfXtbaKFa9D3u9pm', 'Admin@1234', 'SUPER_ADMIN', 0),
(UUID(), 'directoratulpatoliya@gmail.com', '$2b$12$oe./N.URUVDKV90AQARTieIOl0MmvZ68jX9skCUtEtTK6ppWHnxOq', 'Admin@1234', 'MASTER_ADMIN', 0);
