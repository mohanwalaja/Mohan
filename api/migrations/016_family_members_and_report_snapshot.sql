-- ASTRO SIVAM — saved family members + frozen report snapshots.
--
-- WHY THIS EXISTS
--   1) Customers can now save birth details for up to 6 family members in
--      their profile (`family_members`) so future orders can be placed
--      without re-typing forms. Order forms start blank and fill in only
--      the person the customer explicitly picks, so the legacy
--      single-row `birth_profiles` (the customer's own details) is left
--      completely untouched.
--   2) Delivered reports can be downloaded again from the dashboard, but
--      ONLY as the exact report prepared on the order date. `orders` and
--      `order_items` therefore gain an immutable `report_snapshot`: the
--      calculation result written once when the order is created and
--      never updated afterwards. The customer download endpoint renders
--      the PDF from this snapshot (plus the stored input payload) and
--      never recalculates — a re-download years later produces the same
--      report, with the same "Prepared on" date printed on it. Report
--      periods do not refresh: a fresh report needs a new order.
--
-- APPLY (once, on existing production databases):
--   mysql -u<user> -p <database> < api/migrations/016_family_members_and_report_snapshot.sql
-- Fresh installs already get all of this from api/schema.sql and must NOT
-- run this file ("Duplicate column name" errors mean the database is
-- already migrated — nothing is half-applied). The API also creates
-- `family_members` itself (CREATE TABLE IF NOT EXISTS, consistent with
-- first-boot tables) if the table is absent, so the family feature works
-- even before this migration; the snapshot columns are verified at
-- runtime and simply absent until applied — orders keep working exactly
-- as before and the download falls back to the stored calculated_result.
--
-- PRIVILEGES: after applying, revoke ALTER from the web DB user, e.g.
--   REVOKE ALTER ON <database>.* FROM '<webuser>'@'<host>';
--   FLUSH PRIVILEGES;
-- The services router issues no ALTER DDL at all, so it is unaffected.

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
  INDEX `idx_family_members_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `orders`
  ADD COLUMN `report_snapshot` LONGTEXT NULL AFTER `calculated_result`;

ALTER TABLE `orders`
  ADD COLUMN `report_snapshot_at` DATETIME NULL AFTER `report_snapshot`;

ALTER TABLE `order_items`
  ADD COLUMN `report_snapshot` LONGTEXT NULL;

ALTER TABLE `order_items`
  ADD COLUMN `report_snapshot_at` DATETIME NULL;

-- One-time freeze of already-delivered history: an existing stored result
-- is copied verbatim (never recalculated) so long-standing orders also
-- get an immutable download. This backfill runs once, at migration time;
-- it is NOT re-run on reads or downloads.
UPDATE `orders`
   SET `report_snapshot` = `calculated_result`,
       `report_snapshot_at` = COALESCE(`email_sent_at`, `created_at`)
 WHERE `report_snapshot` IS NULL
   AND `calculated_result` IS NOT NULL
   AND `calculated_result` <> '';

UPDATE `order_items`
   SET `report_snapshot` = `calculated_result`,
       `report_snapshot_at` = COALESCE(`sent_at`, `created_at`)
 WHERE `report_snapshot` IS NULL
   AND `calculated_result` IS NOT NULL
   AND `calculated_result` <> '';
