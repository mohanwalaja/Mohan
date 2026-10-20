-- ASTRO SIVAM — astrology team member columns the admin panel writes.
--
-- WHY THIS EXISTS
--   POST /api/admin/team (adding an astrology team member from the admin
--   panel) wrote `name_ta` and `updated_at`, but api/schema.sql never declared
--   either column. On a real MySQL database every "Add Member" click therefore
--   failed with "Unknown column 'name_ta' in 'field list'", the endpoint
--   answered HTTP 500 with an empty body, and the panel — which only reacted
--   when success was true — showed nothing at all. The button looked dead.
--
--   The API now writes only the columns the database actually has, so an
--   unmigrated database accepts a new member instead of failing. This file adds
--   the columns so the Tamil name, education, Tamil bio and the updated stamp
--   are really stored.
--
-- APPLY (once, on databases created before 2026-10):
--   mysql -u<user> -p <database> < api/migrations/019_team_members_columns.sql
-- Fresh installs already get these columns from api/schema.sql and must NOT
-- run this file ("Duplicate column name" means the database is already
-- migrated — nothing is half-applied).
--
-- PRIVILEGES: after applying, make sure the web DB user still has no ALTER
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The routes issue no DDL at all: they only READ the column list.

ALTER TABLE `team_members`
  ADD COLUMN `name_ta` VARCHAR(191) NULL AFTER `name`;

ALTER TABLE `team_members`
  ADD COLUMN `bio_ta` TEXT NULL AFTER `bio`;

ALTER TABLE `team_members`
  ADD COLUMN `education` VARCHAR(255) NULL AFTER `bio_ta`;

ALTER TABLE `team_members`
  ADD COLUMN `education_ta` VARCHAR(255) NULL AFTER `education`;

ALTER TABLE `team_members`
  ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;
