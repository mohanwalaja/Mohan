-- ASTRO SIVAM Single MySQL Database Schema (astrosivam_db)
-- Ready for phpMyAdmin / BigRock cPanel MySQL Database Wizard

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `mobile` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'customer') NOT NULL DEFAULT 'customer',
  `auth_provider` VARCHAR(32) NOT NULL DEFAULT 'local',
  `provider_subject` VARCHAR(191) NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `otp_hash` VARCHAR(255) NULL,
  `otp_expires_at` DATETIME NULL,
  `token_version` INT UNSIGNED NOT NULL DEFAULT 0,
  `password_reset_hash` VARCHAR(255) NULL,
  `password_reset_expires_at` DATETIME NULL,
  `password_reset_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `country` VARCHAR(100) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login` DATETIME NULL,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_email` (`email`),
  UNIQUE KEY `uq_users_provider_subject` (`auth_provider`, `provider_subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Customer Birth Profiles Table
CREATE TABLE IF NOT EXISTS `birth_profiles` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `dob` VARCHAR(32) NOT NULL,
  `tob` VARCHAR(32) NOT NULL,
  `birth_place` VARCHAR(191) NOT NULL,
  `country` VARCHAR(100) NOT NULL,
  `latitude` DECIMAL(10, 6) NOT NULL,
  `longitude` DECIMAL(10, 6) NOT NULL,
  `timezone_offset_hours` DECIMAL(4, 2) NOT NULL,
  `gender` ENUM('M', 'F', 'O') NOT NULL DEFAULT 'M',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- One own-profile row per customer, enforced at the database (legacy
  -- per-order rows are cleaned by migration 018 on existing databases).
  UNIQUE KEY `uq_birth_profiles_user_id` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2b. Saved Family Members Table (up to 6 per customer; see
-- api/migrations/016_family_members_and_report_snapshot.sql). Order forms
-- start blank and fill in only the member the customer explicitly picks.
CREATE TABLE IF NOT EXISTS `family_members` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `relation` ENUM('SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'CHILD', 'RELATIVE', 'FRIEND', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `dob` VARCHAR(32) NOT NULL,
  `tob` VARCHAR(32) NOT NULL,
  `birth_place` VARCHAR(255) NOT NULL,
  `country` VARCHAR(100) NOT NULL DEFAULT '',
  `latitude` DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
  `longitude` DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
  `timezone_offset_hours` DECIMAL(5, 2) NOT NULL DEFAULT 5.50,
  `gender` ENUM('M', 'F') NOT NULL DEFAULT 'M',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_family_members_user_id` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2c. Verified WhatsApp/Viber alert contacts (migration 017): one saved
-- number per customer, verified per app by OTP. Order-status alerts go
-- only to verified apps; reports/invoices are email-only, never chat.
CREATE TABLE IF NOT EXISTS `user_chat_contacts` (
  `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `phone_e164` VARCHAR(32) NOT NULL,
  `whatsapp_verified_at` DATETIME NULL,
  `viber_verified_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_number_otps` (
  `user_id` VARCHAR(64) NOT NULL,
  `channel` ENUM('whatsapp','viber') NOT NULL,
  `phone_e164` VARCHAR(32) NOT NULL,
  `otp_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2d. Birthday wishes on WhatsApp/Viber (migration 020). Reuses the saved birth
-- dates (birth_profiles.dob, family_members.dob) and the OTP-verified number
-- (user_chat_contacts); these two tables add the customer's CONSENT (default
-- OFF, with the site language they opted in with) and the once-a-year DEDUPE
-- log. A wish is text only - reports and invoices stay email-only.
CREATE TABLE IF NOT EXISTS `birthday_wish_preferences` (
  `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  `enabled_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `birthday_wishes_log` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `person_key` VARCHAR(96) NOT NULL,
  `person_name` VARCHAR(191) NOT NULL DEFAULT '',
  `wish_year` INT NOT NULL,
  `wish_date` VARCHAR(16) NOT NULL,
  `channel` VARCHAR(16) NOT NULL,
  `phone_e164` VARCHAR(32) NOT NULL DEFAULT '',
  `status` VARCHAR(16) NOT NULL DEFAULT 'SENT',
  `detail` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_birthday_wish_once_per_year` (`user_id`, `person_key`, `wish_year`, `channel`),
  INDEX `idx_birthday_wishes_user` (`user_id`),
  INDEX `idx_birthday_wishes_date` (`wish_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Orders TableCREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(32) NOT NULL UNIQUE,
  `group_id` VARCHAR(64) NULL,
  `group_order_index` INT NOT NULL DEFAULT 0,
  `user_id` VARCHAR(64) NOT NULL,
  `user_name` VARCHAR(191) NOT NULL,
  `user_email` VARCHAR(191) NOT NULL,
  `user_mobile` VARCHAR(64) NOT NULL,
  `country` VARCHAR(100) NOT NULL DEFAULT '',
  `service_type` VARCHAR(64) NOT NULL,
  `language` VARCHAR(16) NOT NULL DEFAULT 'en',
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
  `service_mode` ENUM('FREE_BETA', 'PAID') NOT NULL DEFAULT 'PAID',
  `status` ENUM('PENDING', 'PENDING_APPROVAL', 'PENDING_PAYMENT_VERIFICATION', 'PROCESSING', 'COMPLETED', 'GENERATED', 'REJECTED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  `payment_method` VARCHAR(32) NULL,
  `payment_reference` VARCHAR(191) NULL,
  `payment_intent_id` VARCHAR(80) NULL,
  `payment_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADMIN',
  `payment_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
  `email_status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `email_sent_at` DATETIME NULL,
  `email_last_status_message` TEXT NULL,
  `input_payload` LONGTEXT NOT NULL,
  `calculated_result` LONGTEXT NULL,
  -- Frozen download snapshot (migration 016): written once at order
  -- creation from the calculated result and NEVER updated, so the
  -- dashboard download is always the report as prepared on the order date.
  `report_snapshot` LONGTEXT NULL,
  `report_snapshot_at` DATETIME NULL,
  `has_pdf` TINYINT(1) NOT NULL DEFAULT 0,
  `has_invoice` TINYINT(1) NOT NULL DEFAULT 0,
  `admin_notes` TEXT NULL,
  `refund_status` ENUM('NONE', 'REQUESTED', 'REFUNDED', 'REJECTED') NOT NULL DEFAULT 'NONE',
  `refund_reason` TEXT NULL,
  -- Pre-approval 90% refund trail (see api/migrations/009_refund_workflow.sql):
  -- refund_percent/refund_amount/refund_currency are computed server-side,
  -- refund_processed_at is the one-click approval instant and refund_deadline is
  -- processed_at + 3 working days (the customer-facing settlement promise).
  `refund_percent` DECIMAL(5, 2) NULL,
  `refund_amount` DECIMAL(10, 2) NULL,
  `refund_currency` VARCHAR(8) NULL,
  `refund_processed_at` DATETIME NULL,
  `refund_deadline` DATETIME NULL,
  `refund_admin_notes` TEXT NULL,
  -- How the money went back: GATEWAY (the provider refund API acknowledged it,
  -- with refund_reference = the provider's refund id) or MANUAL (offline/bank
  -- payment recorded for manual settlement). See api/migrations/010_refund_gateway_settlement.sql.
  `refund_method` VARCHAR(32) NULL,
  `refund_reference` VARCHAR(191) NULL,
  `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_user_id` (`user_id`),
  INDEX `idx_orders_group_id` (`group_id`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_refund_status` (`refund_status`),
  INDEX `idx_orders_service_type` (`service_type`),
  INDEX `idx_orders_ip` (`ip_address`),
  INDEX `idx_orders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Beta IP Limit Tracking Table (Free Beta: exactly 1 FREE REPORT per IP
--    address — the first chart of the first order only. A family order
--    records ONE row: the free first member; the rest of the family pays.)
-- 3b. Durable online payment intents. A provider reference is not
-- accepted as payment until its intent is captured and then bound to one
-- server-priced order by the authenticated owner.
CREATE TABLE IF NOT EXISTS `payment_intents` (
  `id` VARCHAR(80) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `payment_method` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  `amount` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(8) NOT NULL,
  `gateway_order_id` VARCHAR(191) NOT NULL,
  `gateway_payment_id` VARCHAR(191) NULL,
  `gateway_signature` VARCHAR(512) NULL,
  `payment_reference` VARCHAR(191) NULL,
  `payer_account` VARCHAR(191) NULL,
  `order_id` VARCHAR(64) NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payment_intents_user_status` (`user_id`, `status`),
  INDEX `idx_payment_intents_reference` (`payment_reference`),
  INDEX `idx_payment_intents_gateway_order` (`gateway_order_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3c. Payment provider callbacks (webhook audit trail). Every callback that
--     arrives is recorded here for support + forensics.
CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
  `id` VARCHAR(80) NOT NULL PRIMARY KEY,
  `provider` VARCHAR(32) NOT NULL,
  `external_event_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `intent_id` VARCHAR(80) NULL,
  `gateway_order_id` VARCHAR(191) NULL,
  `gateway_payment_id` VARCHAR(191) NULL,
  `detail` VARCHAR(500) NULL,
  `payload_digest` CHAR(32) NULL,
  `ip_address` VARCHAR(64) NULL,
  `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_payment_webhook_provider_event` (`provider`, `external_event_id`),
  INDEX `idx_payment_webhook_received` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3d. Idempotency ledger — the LOCK behind "PayPal is at-least-once".
--     The primary key holds a sha256 of the event identity (provider + event
--     type + gateway payment id + gateway order id) for webhook captures and
--     of the payment intent for order binding. A redelivered event cannot
--     claim a PROCESSED key, so it can never capture or order twice.
--     Runtime twin: astro_payment_ensure_tables() creates this table on every
--     installation that has not been migrated yet.
CREATE TABLE IF NOT EXISTS `payment_idempotency_keys` (
  `idempotency_key` CHAR(64) NOT NULL PRIMARY KEY,
  `scope` VARCHAR(32) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `external_event_id` VARCHAR(191) NULL,
  `intent_id` VARCHAR(80) NULL,
  `order_id` VARCHAR(64) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 1,
  `detail` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payment_idempotency_intent` (`intent_id`),
  INDEX `idx_payment_idempotency_order` (`order_id`),
  INDEX `idx_payment_idempotency_status` (`status`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `beta_ip_orders` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `ip_address` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `order_number` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `user_email` VARCHAR(191) NOT NULL,
  `service_type` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_beta_ip_address` (`ip_address`),
  INDEX `idx_beta_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The unique claim ledger makes the one-free-order-per-IP check atomic even
-- when multiple PHP workers receive requests concurrently. Legacy claims are
-- backfilled by api/services/index.php.
CREATE TABLE IF NOT EXISTS `beta_ip_claims` (
  `ip_address` VARCHAR(64) NOT NULL PRIMARY KEY,
  `claimed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4b. Banned IP Blacklist Table (Anti-Fraud & Anti-Spam Protection)
CREATE TABLE IF NOT EXISTS `banned_ips` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `ip_address` VARCHAR(64) NOT NULL UNIQUE,
  `reason` VARCHAR(255) NOT NULL DEFAULT 'Repeated fake orders / policy violation',
  `banned_by` VARCHAR(191) NULL DEFAULT 'Admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_banned_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Astrology Team Members Table
CREATE TABLE IF NOT EXISTS `team_members` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `name_ta` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `title_ta` VARCHAR(191) NULL,
  `title_hi` VARCHAR(191) NULL,
  `bio` TEXT NOT NULL,
  `bio_ta` TEXT NULL,
  `education` VARCHAR(255) NULL,
  `education_ta` VARCHAR(255) NULL,
  `location` VARCHAR(191) NOT NULL,
  `experience_years` INT NOT NULL DEFAULT 15,
  `specializations` TEXT NOT NULL,
  `photo_url` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `display_order` INT NOT NULL DEFAULT 0,
  `contact_phone` VARCHAR(64) NULL,
  `contact_email` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. System Settings Table
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `service_mode` ENUM('FREE_BETA', 'PAID') NOT NULL DEFAULT 'PAID',
  `free_beta_active` TINYINT(1) NOT NULL DEFAULT 0,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
  `pricing` LONGTEXT NOT NULL,
  `payment_methods` LONGTEXT NOT NULL,
  `email_settings` LONGTEXT NOT NULL,
  `general_settings` LONGTEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NULL,
  `user_name` VARCHAR(191) NULL,
  `user_role` VARCHAR(32) NULL,
  `action` VARCHAR(64) NOT NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_logs_action` (`action`),
  INDEX `idx_audit_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Contact Inquiries Table
CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `mobile` VARCHAR(64) NULL,
  `subject` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('UNREAD', 'READ', 'REPLIED') NOT NULL DEFAULT 'UNREAD',
  `email_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `email_recipient` VARCHAR(191) NULL,
  `email_dispatched_at` DATETIME NULL,
  `email_last_status_message` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contact_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Verified customer reviews (see api/migrations/011_customer_reviews.sql and
--    api/reviews.php). Only the owner of a paid, delivered order may write one;
--    one review per service per order; public only once an admin approves it.
CREATE TABLE IF NOT EXISTS `customer_reviews` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `service_code` VARCHAR(64) NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `title` VARCHAR(191) NULL,
  `body` TEXT NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `location` VARCHAR(120) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `rejection_reason` VARCHAR(255) NULL,
  `moderated_by` VARCHAR(64) NULL,
  `moderated_at` DATETIME NULL,
  `published_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_customer_reviews_order_service` (`order_id`, `service_code`),
  INDEX `idx_customer_reviews_status_published` (`status`, `published_at`),
  INDEX `idx_customer_reviews_user` (`user_id`),
  CONSTRAINT `fk_customer_reviews_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customer_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User accounts are never seeded with shared/default credentials.
-- Create the first administrator with the trusted CLI provisioning tool.

-- TABLE: birthday_email_preferences (1-click customer opt-in for birthday email cards)
CREATE TABLE IF NOT EXISTS `birthday_email_preferences` (
  `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  `enabled_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SEED DATA: Default Settings
INSERT INTO `system_settings` (`id`, `service_mode`, `free_beta_active`, `currency`, `pricing`, `payment_methods`, `email_settings`, `general_settings`, `updated_at`)
VALUES (
  1,
  'PAID',
  0,
  'USD',
  '{"BIRTH_JATHAGAM":{"usd":18,"inr":1512},"MARRIAGE_COMPATIBILITY":{"usd":22,"inr":1848},"BABY_NAMING":{"usd":15,"inr":1260},"MUHURTHAM":{"usd":20,"inr":1680}}',
  '{"paypal":{"enabled":true,"merchantEmail":"admin@astrosivam.com","instructions":"Pay securely using PayPal or international Debit/Credit card."},"gpay":{"enabled":true,"instructions":"Pay in INR via Google Pay / UPI; the payer confirms the UPI reference at checkout."}}',
  '{"smtpHost":"mail.astrosivam.com","smtpPort":465,"smtpUser":"admin@astrosivam.com","smtpPass":"","smtpSecure":"ssl","fromName":"ASTRO SIVAM","fromEmail":"admin@astrosivam.com","adminNotificationEmail":"admin@astrosivam.com","replyToEmail":"admin@astrosivam.com"}',
  '{"siteName":"ASTRO SIVAM","tagline":"Authentic Vedic Astrology & Matchmaking","turnaroundHours":12,"contactPhone":"+679 999 8888","contactEmail":"admin@astrosivam.com"}',
  NOW()
)
ON DUPLICATE KEY UPDATE `currency` = VALUES(`currency`);

-- SEED DATA: Team Members
INSERT INTO `team_members` (`id`, `name`, `title`, `title_ta`, `bio`, `location`, `experience_years`, `specializations`, `photo_url`, `is_active`, `display_order`, `contact_phone`, `contact_email`)
VALUES 
('tm_01', 'Dr. S. K. Narayana Sastrigal', 'Head Sanskrit Scholar & Jyotisha Acharya', 'முதன்மை சமஸ்கிருத ஜோதிட ஆச்சார்யர்', 'Over 32 years of Vedic astrology scholarship, specialized in Jaimini Sutras, Prashna Sastra, and Dasha calculations from Thanjavur, Tamil Nadu.', 'Thanjavur, Tamil Nadu, India', 32, '["Birth Jathagam", "Dasha Bhukti", "Prashna", "Remedial Puja"]', 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&h=200&fit=crop', 1, 1, '+91 94441 23456', 'narayana@astrosivam.com'),
('tm_02', 'Brahmasri V. Ganesa Sivachariyar', 'Senior Temple Sivachariyar & Muhurtha Vidwan', 'முதுநிலை சிவாச்சாரியார் & முகூர்த்த வித்வான்', 'Heritage Shaiva Sivachariyar with deep expertise in 10-Poruthams marriage matching, dosha nivrutti, and temple consecration rituals.', 'Madurai, Tamil Nadu, India', 28, '["Marriage Poruthams", "Dosha Nivrutti", "Muhurtham", "Temple Puja"]', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', 1, 2, '+91 98410 78901', 'ganesan@astrosivam.com'),
('tm_03', 'Jyothida Rathna K. Ramachandran', 'Vedic Ephemeris & Astronomical Systems Specialist', 'பஞ்சாங்க கணித ஜோதிட ரத்னா', 'Expert in Nirayana Surya Siddhanta ephemeris models, planetary latitudes, and precise Nakshatra Pada computations for global diaspora coordinates.', 'Chennai, Tamil Nadu, India', 24, '["Ephemeris Calculations", "Kundali Generation", "Baby Naming Syllables", "Panchangam"]', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', 1, 3, '+91 98840 54321', 'ramachandran@astrosivam.com')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

SET FOREIGN_KEY_CHECKS = 1;
