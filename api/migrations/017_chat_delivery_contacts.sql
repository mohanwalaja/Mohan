-- ASTRO SIVAM — verified WhatsApp/Viber delivery contacts.
--
-- WHY THIS EXISTS
--   Customers can now save ONE mobile number in their profile and verify
--   it separately on WhatsApp and/or Viber with a one-time code sent in
--   that app. Once an app is verified, delivered orders ALSO send the
--   actual report + invoice PDFs to that app — in addition to email,
--   which remains the official delivery channel. Verification state
--   lives in `user_chat_contacts`; pending codes (HMAC hashes only,
--   never plain text) in `chat_number_otps`. The checkout `user_mobile`
--   on orders is NOT reused: it was never verified.
--
-- APPLY (once, on existing production databases):
--   mysql -u<user> -p <database> < api/migrations/017_chat_delivery_contacts.sql
-- Fresh installs already get these tables from api/schema.sql. The API
-- also creates both tables itself (CREATE TABLE IF NOT EXISTS,
-- consistent with first-boot tables) if they are absent, so the feature
-- works even before this file is applied.
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The services router issues no ALTER DDL at all, so it is unaffected.

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
