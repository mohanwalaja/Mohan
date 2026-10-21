-- ASTRO SIVAM — birthday wishes on WhatsApp / Viber (migration 020).
--
-- WHY THIS EXISTS
--   Owner request (2026-10-21): whoever saved their birth details on the site
--   should receive birthday wishes on WhatsApp or Viber on their birthday. The
--   birth dates already exist (birth_profiles.dob, family_members.dob) and the
--   verified chat number already exists (user_chat_contacts, migration 017), so
--   this adds only the two things that were missing: the customer's CONSENT and
--   a once-a-year DEDUPE log.
--
--   Consent is a separate table on purpose. An order alert is transactional and
--   announced at checkout; a birthday wish is not, and WhatsApp's business
--   policy requires opt-in for it. Nothing is sent until the customer switches
--   it on themselves, and the switch stores the site language they were using,
--   which is the language the wish is written in.
--
-- APPLY (once, on existing production databases):
--   mysql -u<user> -p <database> < api/migrations/020_birthday_wishes.sql
-- Fresh installs already get both tables from api/schema.sql. The dispatcher
-- also creates them itself (CREATE TABLE IF NOT EXISTS) if they are absent, so
-- the feature works before this file is applied.
--
-- PRIVILEGES: this migration is CREATE TABLE only — no ALTER, consistent with
-- revoking ALTER from the web DB user. The daily cron script
-- (api/cron/birthday_wishes.php) and the customer/admin routes never issue DDL
-- beyond CREATE TABLE IF NOT EXISTS.
--
-- SCHEDULING (cPanel > Cron Jobs, daily at 08:00 IST — see
-- BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md):
--   0 8 * * *  /usr/local/bin/php /home/<account>/public_html/api/cron/birthday_wishes.php >> /home/<account>/logs/birthday_wishes.log 2>&1

CREATE TABLE IF NOT EXISTS `birthday_wish_preferences` (
  `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  -- Default OFF: a customer who never touched this setting is never messaged.
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  -- The site language in use when they opted in: 'en' | 'ta' | 'hi'.
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  `enabled_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `birthday_wishes_log` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  -- 'self' for the account holder's own birth profile, 'fm:<family_member_id>'
  -- for a saved family member. This is the dedupe identity of a person.
  `person_key` VARCHAR(96) NOT NULL,
  `person_name` VARCHAR(191) NOT NULL DEFAULT '',
  `wish_year` INT NOT NULL,
  `wish_date` VARCHAR(16) NOT NULL,
  `channel` VARCHAR(16) NOT NULL,
  `phone_e164` VARCHAR(32) NOT NULL DEFAULT '',
  -- FAILED is logged too: re-messaging a gateway that already accepted the text
  -- is worse than leaving one wish unsent.
  `status` VARCHAR(16) NOT NULL DEFAULT 'SENT',
  `detail` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- THE RULE: one wish per person, per year, per channel. A cron that fires
  -- twice — or an admin who presses "Send now" after the cron ran — cannot
  -- message anybody a second time.
  UNIQUE KEY `uq_birthday_wish_once_per_year` (`user_id`, `person_key`, `wish_year`, `channel`),
  INDEX `idx_birthday_wishes_user` (`user_id`),
  INDEX `idx_birthday_wishes_date` (`wish_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
