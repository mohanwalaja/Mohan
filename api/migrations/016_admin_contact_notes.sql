-- Persist the admin's inbox notes instead of silently discarding them.
--
-- APPLY once to databases created before this release:
--   mysql -u<user> -p <database> < api/migrations/016_admin_contact_notes.sql
-- Fresh installations already receive this column from api/schema.sql.

ALTER TABLE `contact_messages`
  ADD COLUMN `admin_notes` TEXT NULL AFTER `status`;
