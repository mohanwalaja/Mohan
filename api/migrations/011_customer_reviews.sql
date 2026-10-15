-- ============================================================================
-- ASTRO SIVAM - Migration 011: verified customer reviews
-- ============================================================================
--
-- WHY
-- ---
-- SEO audit 2026-10-15 (finding 3): the homepage testimonials were hand-entered,
-- months old and tied to no order. Customers can now review what they bought,
-- from the customer dashboard, and an administrator publishes each review.
--
--   - Only the owner of a PAID order whose report was DELIVERED (COMPLETED /
--     GENERATED, payment confirmed, not refunded) may write one. The rule lives
--     in api/reviews.php (astro_review_order_eligibility) and is enforced on
--     submit, on approval and again when the public list is read.
--   - One review per service per order (UNIQUE order_id + service_code): a
--     multi-person order can review each service it contained. Editing a review
--     puts it back to PENDING.
--   - status: PENDING -> APPROVED (published_at set) | REJECTED (optional
--     rejection_reason shown to the customer).
--
-- Deleting an order or a user account deletes its reviews (ON DELETE CASCADE).
--
-- HOW TO RUN (phpMyAdmin)
-- -----------------------
--   1. Select the `astrosivam_db` database.
--   2. "Import" -> choose this file -> Go.  (Or "SQL" -> paste -> Go.)
--   Re-running it is safe (CREATE TABLE IF NOT EXISTS).
--
-- NOTE FOR DEVELOPERS
-- -------------------
-- api/reviews.php::astro_reviews_ensure_table() creates the same table at
-- runtime when it is missing (and retries without the foreign keys on hosts
-- that refuse them), matching the self-healing DDL convention of api/db.php.
-- api/schema.sql declares it too. Keep all three definitions in sync.
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `customer_reviews` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `service_code` VARCHAR(64) NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `title` VARCHAR(191) NULL,
  `body` TEXT NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `location` VARCHAR(120) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `rejection_reason` VARCHAR(255) NULL,
  `moderated_by` VARCHAR(64) NULL,
  `moderated_at` DATETIME NULL,
  `published_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_customer_reviews_order_service` (`order_id`, `service_code`),
  INDEX `idx_customer_reviews_status_published` (`status`, `published_at`),
  INDEX `idx_customer_reviews_user` (`user_id`),
  CONSTRAINT `fk_customer_reviews_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customer_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
