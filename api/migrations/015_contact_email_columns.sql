-- ASTRO SIVAM — contact_messages email-outcome columns (Admin Inbox).
--
-- WHY THIS EXISTS
--   After a contact inquiry is stored and forwarded to the admin mailbox, the
--   API records the delivery outcome (email_status / email_recipient /
--   email_dispatched_at / email_last_status_message) for the Admin Inbox
--   listing. api/services/index.php used to ADD these columns on a web
--   request (ALTER TABLE, errors swallowed); that runtime DDL is removed —
--   web requests never ALTER, and the web DB user is granted no ALTER
--   privilege. The API now verifies the columns exist; a database that
--   predates them only skips the outcome UPDATE (the inquiry itself is
--   already stored) and logs a line naming this file.
--
-- APPLY (once, on databases created before 2026-10):
--   mysql -u<user> -p <database> < api/migrations/015_contact_email_columns.sql
-- Fresh installs already get these columns from api/schema.sql and must NOT
-- run this file ("Duplicate column name" errors mean the database is already
-- migrated — nothing is half-applied).
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The services router issues no DDL at all after this change, so it is
-- unaffected. (CREATE is deliberately kept: first-boot tables such as
-- api_rate_limits are still created on first use.)

ALTER TABLE `contact_messages`
  ADD COLUMN `email_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `contact_messages`
  ADD COLUMN `email_recipient` VARCHAR(191) NULL;

ALTER TABLE `contact_messages`
  ADD COLUMN `email_dispatched_at` DATETIME NULL;

ALTER TABLE `contact_messages`
  ADD COLUMN `email_last_status_message` VARCHAR(255) NULL;
