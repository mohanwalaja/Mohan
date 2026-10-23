-- Migration 021: 1-click Email Birthday Wishes opt-in preference table.
-- CREATE TABLE IF NOT EXISTS only (no ALTER privileges needed at runtime).
CREATE TABLE IF NOT EXISTS `birthday_email_preferences` (
  `user_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  `enabled_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
