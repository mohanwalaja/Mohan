-- ASTRO SIVAM — payment webhook / order-binding idempotency ledger.
--
-- WHY THIS EXISTS
--   Razorpay retries its own webhook deliveries and PayPal webhooks are
--   delivered at-least-once. Without a durable "I already processed this
--   event" lock, a resend could capture a payment intent twice or attach a
--   second family of orders to one payment. This table IS that lock: its
--   PRIMARY KEY is a sha256 of the event identity, so the second delivery
--   collides on the key instead of racing on a SELECT.
--
--     scope 'webhook-capture'  key = hash(provider, event type, gateway
--                                    payment id, gateway order id)
--     scope 'multi-order'      key = hash(provider, intent id, user id, scope)
--     scope 'single-order'     key = hash(provider, intent id, user id, scope)
--
--   status: IN_PROGRESS (a worker owns it) | PROCESSED (terminal, replay is a
--   no-op) | FAILED (the attempt died; a later delivery may retry it).
--   attempts > 1 shows a capture that survived a deadlock/lock-wait retry and
--   is surfaced in the admin payment-recovery panel.
--
-- APPLY: mysql -u<user> -p <database> < api/migrations/008_payment_idempotency.sql
--        Safe to re-run: the statement is idempotent. api/payments.php creates
--        the same table at runtime (astro_payment_ensure_tables), so an
--        unmigrated installation keeps working; this file exists so the schema
--        is reviewable and reproducible next to the other migrations.
--
-- COLUMN TYPES
--   CHAR(64) holds a sha256 hex digest. intent_id/order_id mirror the types in
--   api/schema.sql (VARCHAR(80) / VARCHAR(64)) so joins keep matching — do not
--   "tidy" them to INT.

CREATE TABLE IF NOT EXISTS `payment_idempotency_keys` (
  `idempotency_key` CHAR(64) NOT NULL PRIMARY KEY,
  `scope` VARCHAR(32) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `external_event_id` VARCHAR(191) NULL,
  `intent_id` VARCHAR(80) NULL,
  `order_id` VARCHAR(64) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 1,
  `detail` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payment_idempotency_intent` (`intent_id`),
  INDEX `idx_payment_idempotency_order` (`order_id`),
  INDEX `idx_payment_idempotency_status` (`status`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
