-- ASTRO SIVAM — ai_chat_sessions.person_id (AI family person picker).
--
-- WHY THIS EXISTS
--   The AI astrologer answers about one selected family member per session,
--   tracked by ai_chat_sessions.person_id. api/ai_astrologer.php used to ADD
--   this column on a web request (ALTER TABLE with the error path unhandled);
--   that runtime DDL is removed — web requests never ALTER, and the web DB
--   user is granted no ALTER privilege. The API now verifies the column
--   exists and fails loudly (503 + a log line naming this file) when it
--   does not.
--
-- APPLY (once, on databases created before 2026-10):
--   mysql -u<user> -p <database> < api/migrations/014_ai_chat_person_id.sql
-- Fresh installs already get this column from
-- api/migrations/007_ai_astrologer_chat.sql and must NOT run this file
-- ("Duplicate column name" errors mean the database is already migrated —
-- nothing is half-applied).
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The AI endpoint issues no DDL at all after this change, so it is
-- unaffected. (CREATE is deliberately kept: first-boot tables such as
-- api_rate_limits are still created on first use.)

ALTER TABLE `ai_chat_sessions`
  ADD COLUMN `person_id` INT NULL AFTER `service_type`;
