<?php
/**
 * ASTRO SIVAM - account birth profile helpers.
 *
 * The customer's own saved birth details are ONE row per account. Legacy
 * behaviour (an order silently saving a profile row per order, before the
 * explicit opt-in) could leave several rows behind, and a racing double
 * submit could still try to insert a second one. Every reader therefore
 * picks the NEWEST row deterministically (ORDER BY updated_at DESC, id DESC),
 * and astro_birth_profiles_dedupe() collapses a customer's rows back to that
 * newest one before anything counts them.
 *
 * The SQL here is deliberately portable (plain SELECT/DELETE) so the helpers
 * run identically on MySQL/MariaDB in production and on SQLite in the test
 * runtime.
 */

/**
 * Does the customer already have their own saved birth profile?
 *
 * THEIR own profile is a boolean slot in the "6 saved people" family budget
 * — never a row count. Counting rows would let a handful of legacy
 * duplicates spend the whole budget (a customer with many past orders was
 * wrongly told the family list was full after two members).
 */
function astro_birth_profile_exists($pdo, string $userId): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM birth_profiles WHERE user_id = ? LIMIT 1");
    $stmt->execute([$userId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * Collapse a customer's duplicate birth_profiles rows to the single newest
 * one (updated_at DESC, then id DESC — the same order every reader uses, so
 * the visible profile never changes when duplicates are removed). Returns
 * how many legacy rows were deleted.
 *
 * api/migrations/018_birth_profiles_one_row_per_user.sql removes duplicates
 * globally and locks the table to one row per user; this helper keeps the
 * affected customer correct even before that migration runs.
 */
function astro_birth_profiles_dedupe($pdo, string $userId): int {
    $stmt = $pdo->prepare("SELECT id FROM birth_profiles WHERE user_id = ? ORDER BY updated_at DESC, id DESC");
    $stmt->execute([$userId]);
    $ids = $stmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];
    if (count($ids) <= 1) {
        return 0;
    }
    // Keep $ids[0] (the newest row); delete the legacy rest.
    array_shift($ids);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $del = $pdo->prepare("DELETE FROM birth_profiles WHERE user_id = ? AND id IN ($placeholders)");
    $del->execute([$userId, ...$ids]);
    return (int)$del->rowCount();
}
