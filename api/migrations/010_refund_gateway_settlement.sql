-- ASTRO SIVAM — automatic (gateway) refund settlement trail.
--
-- WHY THIS EXISTS
--   The one-click refund in the Admin Portal now really returns the money: for a
--   payment this server captured online it calls the provider's refund API
--   (Razorpay /v1/payments/{id}/refund, PayPal /v2/payments/captures/{id}/refund)
--   BEFORE marking the order refunded. Two columns record what happened so the
--   portal, the customer and the audit trail can all see it:
--
--     refund_method     'GATEWAY' when the provider acknowledged the refund,
--                       'MANUAL'  when there was no online capture to reverse
--                       (bank transfer / receipt verified by hand) and the
--                       administrator settles it within 3 working days.
--     refund_reference  the provider's own refund id (e.g. PayPal `id`,
--                       Razorpay `rfnd_...`). It is also the guard that makes a
--                       retried click idempotent: an order that already holds a
--                       reference is never refunded a second time.
--
--   Offline orders keep both columns NULL/'MANUAL'; nothing about historical
--   rows changes and no amount is migrated.
--
-- APPLY: mysql -u<user> -p <database> < api/migrations/010_refund_gateway_settlement.sql
--        api/db.php::astro_ensure_refund_schema() performs the same DDL at
--        runtime, so an unmigrated installation keeps working; this file exists
--        so the change is reviewable and reproducible next to the rest.

ALTER TABLE `orders`
  ADD COLUMN `refund_method` VARCHAR(32) NULL AFTER `refund_admin_notes`,
  ADD COLUMN `refund_reference` VARCHAR(191) NULL AFTER `refund_method`;
