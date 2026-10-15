-- ASTRO SIVAM — users social-identity columns (Google/Facebook sign-in).
--
-- WHY THIS EXISTS
--   Social sign-in keys accounts by an immutable provider subject
--   (auth_provider + provider_subject) instead of by email alone, so a
--   recycled email address can never inherit someone else's account and
--   automatic cross-provider linking stays disabled. api/auth/index.php used
--   to ADD these columns on the first social login (ALTER TABLE on a web
--   request, errors swallowed); that runtime DDL is removed — web requests
--   never ALTER, and the web DB user is granted no ALTER privilege. The API
--   now verifies the columns exist and fails loudly (503 + a log line naming
--   this file) when they do not.
--
-- APPLY (once, on databases created before 2026-10):
--   mysql -u<user> -p <database> < api/migrations/012_social_identity_columns.sql
-- Fresh installs already get these columns from api/schema.sql and must NOT
-- run this file ("Duplicate column name" / "Duplicate key name" errors mean
-- the database is already migrated — nothing is half-applied).
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The auth router issues no DDL at all after this change, so it is unaffected.
-- (CREATE is deliberately kept: first-boot tables such as api_rate_limits are
-- still created on first use by api/rate_limit.php.)

ALTER TABLE `users`
  ADD COLUMN `auth_provider` VARCHAR(32) NOT NULL DEFAULT 'local' AFTER `role`;

ALTER TABLE `users`
  ADD COLUMN `provider_subject` VARCHAR(191) NULL AFTER `auth_provider`;

ALTER TABLE `users`
  ADD UNIQUE KEY `uq_users_provider_subject` (`auth_provider`, `provider_subject`);
