-- ASTRO SIVAM — DDL previously executed inline on admin web requests.
--
-- WHY THIS EXISTS
--   api/admin/index.php used to ALTER TABLE / CREATE TABLE on live requests —
--   the family-bundle columns (group_id, group_order_index), the online-payment
--   columns (payment_intent_id, payment_status) and the banned_ips table —
--   swallowing every error. That runtime DDL is removed: web requests in the
--   admin router never ALTER or CREATE, and the web DB user is granted no
--   ALTER privilege. The admin API now verifies these objects exist and fails
--   loudly (503 + a log line naming this file) when they do not.
--
-- APPLY (once, on databases created before 2026-10):
--   mysql -u<user> -p <database> < api/migrations/013_web_request_ddl_consolidation.sql
-- Fresh installs already get all of this from api/schema.sql and must NOT run
-- this file ("Duplicate column name" errors mean the database is already
-- migrated — nothing is half-applied).
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The admin router issues no DDL at all after this change, so it is unaffected.
-- (No web request anywhere issues ALTER TABLE anymore — the former fallback
-- guards in api/db.php, api/services/index.php and api/ai_astrologer.php only
-- verify the migrated schema now. CREATE TABLE IF NOT EXISTS bootstraps are
-- deliberately kept for first-boot tables such as api_rate_limits: they need
-- the CREATE privilege, not ALTER, and are no-ops once migrated.)

ALTER TABLE `orders`
  ADD COLUMN `group_id` VARCHAR(64) NULL AFTER `order_number`;

ALTER TABLE `orders`
  ADD COLUMN `group_order_index` INT NOT NULL DEFAULT 0 AFTER `group_id`;

ALTER TABLE `orders`
  ADD COLUMN `payment_intent_id` VARCHAR(80) NULL;

ALTER TABLE `orders`
  ADD COLUMN `payment_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADMIN';

CREATE TABLE IF NOT EXISTS `banned_ips` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `ip_address` VARCHAR(64) NOT NULL UNIQUE,
  `reason` VARCHAR(255) NOT NULL DEFAULT 'Repeated fake orders / policy violation',
  `banned_by` VARCHAR(191) NULL DEFAULT 'Admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_banned_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
