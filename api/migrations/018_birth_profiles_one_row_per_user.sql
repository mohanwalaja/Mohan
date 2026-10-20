-- ASTRO SIVAM — one account birth profile row per customer.
--
-- WHY THIS EXISTS
--   The customer's own saved birth details (`birth_profiles`) are ONE row
--   per account by design. Legacy behaviour (before saving was an explicit
--   opt-in) could add a row per order, and nothing prevented two racing
--   saves from inserting two rows. Those duplicates are not just untidy:
--   the saved-family budget ("6 saved people including yourself") once
--   counted ROWS, so a customer with a few past orders was told the list
--   was full after saving a single family member. The runtime helpers in
--   api/birth_profiles.php now count the holder as a boolean and collapse
--   duplicates lazily, and this migration cleans the whole table once and
--   locks it so duplicates can never form again.
--
-- WHAT IT DOES
--   1) DELETEs every duplicate birth_profiles row, keeping the NEWEST row
--      for each customer (highest updated_at, then highest id — the exact
--      order the API reads with, so the visible profile never changes).
--   2) Adds a UNIQUE key on birth_profiles.user_id (recreating the index
--      under its new name) so concurrent saves cannot double-insert.
--
-- APPLY (once, on existing production databases):
--   mysql -u<user> -p <database> < api/migrations/018_birth_profiles_one_row_per_user.sql
-- Fresh installs already get the UNIQUE key from api/schema.sql and must
-- NOT run this ALTER ("Duplicate key name" errors mean the database is
-- already migrated — nothing is half-applied). The DELETE is safe to
-- re-run: with no duplicates left it matches no rows.

DELETE bp FROM `birth_profiles` bp
INNER JOIN `birth_profiles` newer
    ON newer.`user_id` = bp.`user_id`
    AND (
        newer.`updated_at` > bp.`updated_at`
        OR (newer.`updated_at` = bp.`updated_at` AND newer.`id` > bp.`id`)
    );

ALTER TABLE `birth_profiles`
    DROP INDEX `idx_birth_profiles_user_id`,
    ADD UNIQUE KEY `uq_birth_profiles_user_id` (`user_id`);
