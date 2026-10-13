-- ASTRO SIVAM — refund workflow (pre-approval 90% one-click refund).
--
-- WHY THIS EXISTS
--   The refund policy is: BEFORE admin approval an order is refundable at 90%
--   (the other 10% is the non-refundable payment-gateway/processing fee), and
--   AFTER admin approval the report + invoice have been emailed, so the order
--   is completed and non-refundable. Recording that needs more than the
--   original `refund_status`/`refund_reason` pair:
--
--     refund_percent       the percent actually applied (90 before approval)
--     refund_amount        money refunded, computed server-side (never typed)
--     refund_currency      the currency the customer paid in
--     refund_processed_at  when the admin approved the refund
--     refund_deadline      processed_at + 3 WORKING DAYS (the customer-facing
--                          settlement promise; weekends/holidays do not count)
--     refund_admin_notes   free-text trail for the admin
--
--   api/schema.sql also declares `status` as
--   ENUM('PENDING','PROCESSING','COMPLETED','REJECTED','CANCELLED'), which has
--   no 'REFUNDED' member. The refund path must store 'REFUNDED' (and the
--   portal/analytics read it back), so the enum is widened here. Existing rows
--   keep their current value; only the allowed vocabulary grows.
--
-- APPLY: mysql -u<user> -p <database> < api/migrations/009_refund_workflow.sql
--        api/db.php::astro_ensure_refund_schema() performs the same DDL at
--        runtime, so an unmigrated installation keeps working; this file exists
--        so the change is reviewable and reproducible next to the rest.
--
-- COLUMN TYPES mirror api/schema.sql (cursor DECIMAL(10,2) money columns,
-- VARCHAR(8) currency) — do not "tidy" them, the API casts on read.

ALTER TABLE `orders`
  ADD COLUMN `refund_percent` DECIMAL(5, 2) NULL AFTER `refund_reason`,
  ADD COLUMN `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_percent`,
  ADD COLUMN `refund_currency` VARCHAR(8) NULL AFTER `refund_amount`,
  ADD COLUMN `refund_processed_at` DATETIME NULL AFTER `refund_currency`,
  ADD COLUMN `refund_deadline` DATETIME NULL AFTER `refund_processed_at`,
  ADD COLUMN `refund_admin_notes` TEXT NULL AFTER `refund_deadline`,
  ADD INDEX `idx_orders_refund_status` (`refund_status`);

ALTER TABLE `orders`
  MODIFY COLUMN `status` ENUM(
    'PENDING',
    'PENDING_APPROVAL',
    'PENDING_PAYMENT_VERIFICATION',
    'PROCESSING',
    'COMPLETED',
    'GENERATED',
    'REJECTED',
    'CANCELLED',
    'REFUNDED'
  ) NOT NULL DEFAULT 'PENDING';
