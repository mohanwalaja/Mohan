<?php
/**
 * ASTRO SIVAM — Server-Assisted Geocoding Cache & Order Birth Details Editor
 *
 * 1. Provides fast cached server-side geocoding & reverse-geocoding so browser
 *    clients have reliable User-Agent headers, short timeouts, and shared caching.
 * 2. Allows Administrators (on any order) and Customers (strictly BEFORE an
 *    order is approved/delivered) to fix typos in submitted birth particulars
 *    and immediately recalculate the astronomical chart on the server.
 */

require_once __DIR__ . '/astrology/engine.php';

function astro_geo_cache_dir(): string {
    $dir = rtrim(sys_get_temp_dir(), '/\\') . '/astrosivam_geo_cache_v1';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

function astro_geo_cache_get(string $key, int $ttlSeconds = 604800): ?array {
    $file = astro_geo_cache_dir() . '/' . hash('sha256', $key) . '.json';
    if (!is_file($file)) {
        return null;
    }
    $mtime = @filemtime($file);
    if ($mtime === false || (time() - $mtime) > $ttlSeconds) {
        return null;
    }
    $raw = @file_get_contents($file);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function astro_geo_cache_put(string $key, array $payload): void {
    $file = astro_geo_cache_dir() . '/' . hash('sha256', $key) . '.json';
    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function astro_geo_http_get_json(string $url, float $timeoutSeconds = 3.0): ?array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => max(2, (int)ceil($timeoutSeconds)),
            CURLOPT_USERAGENT => 'AstroSivam/2.0 (+https://astrosivam.com; geocoding)',
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: en'],
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body) || $body === '' || $code < 200 || $code >= 300) {
            return null;
        }
        $decoded = json_decode($body, true);
        return is_array($decoded) ? $decoded : null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => $timeoutSeconds,
            'header' => "User-Agent: AstroSivam/2.0 (+https://astrosivam.com)\r\nAccept: application/json\r\nAccept-Language: en\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if (!is_string($body) || $body === '') {
        return null;
    }
    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : null;
}

function astro_geo_offset_for_coords(float $lat, float $lng): array {
    $tzId = AstroEngine::getTimeZoneIdForCoordinates($lat, $lng);
    $offset = round($lng / 15.0 * 2) / 2;
    if ($tzId !== null && $tzId !== '') {
        try {
            $zone = new \DateTimeZone($tzId);
            $now = new \DateTimeImmutable('now', $zone);
            $offset = round($zone->getOffset($now) / 3600, 4);
        } catch (\Throwable $e) {
            // Keep longitude fallback when runtime lacks zone data
        }
    }
    return ['timeZoneId' => $tzId, 'timezoneOffsetHours' => $offset];
}

function astro_geocode_search(string $query, int $limit = 8): array {
    $clean = trim($query);
    if ($clean === '' || strlen($clean) < 2) {
        return [];
    }
    $limit = max(1, min(12, $limit));
    $cacheKey = 'search:' . strtolower($clean) . ':' . $limit;
    $cached = astro_geo_cache_get($cacheKey);
    if ($cached !== null) {
        return $cached;
    }

    $results = [];
    $photon = astro_geo_http_get_json(
        'https://photon.komoot.io/api/?q=' . rawurlencode($clean) . '&limit=' . $limit
    );
    if (is_array($photon) && !empty($photon['features']) && is_array($photon['features'])) {
        foreach ($photon['features'] as $feat) {
            $props = $feat['properties'] ?? [];
            $coords = $feat['geometry']['coordinates'] ?? null;
            if (!is_array($coords) || count($coords) < 2) {
                continue;
            }
            $lng = round((float)$coords[0], 4);
            $lat = round((float)$coords[1], 4);
            $name = trim((string)($props['name'] ?? ''));
            $city = trim((string)($props['city'] ?? $props['town'] ?? $props['village'] ?? $props['district'] ?? ''));
            $state = trim((string)($props['state'] ?? ''));
            $country = trim((string)($props['country'] ?? 'Global'));

            $parts = [];
            if ($name !== '') $parts[] = $name;
            if ($city !== '' && $city !== $name) $parts[] = $city;
            if ($state !== '' && $state !== $name && $state !== $city) $parts[] = $state;
            if ($country !== '' && $country !== 'Global' && !in_array($country, $parts, true)) $parts[] = $country;

            $tzInfo = astro_geo_offset_for_coords($lat, $lng);
            $results[] = [
                'placeName' => !empty($parts) ? implode(', ', $parts) : ($name !== '' ? $name : $clean),
                'country' => $country,
                'latitude' => $lat,
                'longitude' => $lng,
                'timezoneOffsetHours' => $tzInfo['timezoneOffsetHours'],
                'timeZoneId' => $tzInfo['timeZoneId'],
                'state' => $state !== '' ? $state : null,
                'city' => ($city !== '' ? $city : ($name !== '' ? $name : null)),
            ];
        }
    }

    if (empty($results)) {
        $nominatim = astro_geo_http_get_json(
            'https://nominatim.openstreetmap.org/search?q=' . rawurlencode($clean) . '&format=json&addressdetails=1&limit=' . min(8, $limit)
        );
        if (is_array($nominatim)) {
            foreach ($nominatim as $item) {
                if (!isset($item['lat'], $item['lon'])) {
                    continue;
                }
                $lat = round((float)$item['lat'], 4);
                $lng = round((float)$item['lon'], 4);
                $addr = $item['address'] ?? [];
                $locality = trim((string)($addr['village'] ?? $addr['suburb'] ?? $addr['neighbourhood'] ?? $addr['town'] ?? $addr['city'] ?? $addr['county'] ?? $item['name'] ?? ''));
                $state = trim((string)($addr['state'] ?? ''));
                $country = trim((string)($addr['country'] ?? 'Global'));
                $parts = array_values(array_filter([$locality, $state, $country]));
                $displayFallback = implode(', ', array_slice(array_map('trim', explode(',', (string)($item['display_name'] ?? $clean))), 0, 3));
                $tzInfo = astro_geo_offset_for_coords($lat, $lng);

                $results[] = [
                    'placeName' => !empty($parts) ? implode(', ', $parts) : $displayFallback,
                    'country' => $country,
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'timezoneOffsetHours' => $tzInfo['timezoneOffsetHours'],
                    'timeZoneId' => $tzInfo['timeZoneId'],
                    'state' => $state !== '' ? $state : null,
                    'city' => $locality !== '' ? $locality : null,
                ];
            }
        }
    }

    if (!empty($results)) {
        astro_geo_cache_put($cacheKey, $results);
    }
    return $results;
}

function astro_reverse_geocode(float $lat, float $lng): ?array {
    if (!is_finite($lat) || !is_finite($lng) || abs($lat) > 90 || abs($lng) > 180) {
        return null;
    }
    $rlat = round($lat, 4);
    $rlng = round($lng, 4);
    $cacheKey = 'reverse:' . $rlat . ':' . $rlng;
    $cached = astro_geo_cache_get($cacheKey);
    if ($cached !== null) {
        return $cached;
    }

    $tzInfo = astro_geo_offset_for_coords($rlat, $rlng);
    $data = astro_geo_http_get_json(
        'https://nominatim.openstreetmap.org/reverse?lat=' . rawurlencode((string)$rlat) . '&lon=' . rawurlencode((string)$rlng) . '&format=json'
    );

    $city = '';
    $state = '';
    $country = 'Global';
    $placeName = "Location ({$rlat}, {$rlng})";
    if (is_array($data)) {
        $addr = $data['address'] ?? [];
        $city = trim((string)($addr['village'] ?? $addr['suburb'] ?? $addr['town'] ?? $addr['city'] ?? $addr['county'] ?? ''));
        $state = trim((string)($addr['state'] ?? ''));
        $country = trim((string)($addr['country'] ?? 'Global'));
        if ($city !== '' || $state !== '') {
            $placeName = implode(', ', array_values(array_filter([$city, $state, $country])));
        } elseif (!empty($data['display_name'])) {
            $placeName = implode(', ', array_slice(array_map('trim', explode(',', (string)$data['display_name'])), 0, 3));
        }
    }

    $resolved = [
        'placeName' => $placeName,
        'country' => $country,
        'latitude' => $rlat,
        'longitude' => $rlng,
        'timezoneOffsetHours' => $tzInfo['timezoneOffsetHours'],
        'timeZoneId' => $tzInfo['timeZoneId'],
        'state' => $state !== '' ? $state : null,
        'city' => $city !== '' ? $city : null,
    ];
    if ($placeName !== "Location ({$rlat}, {$rlng})") {
        astro_geo_cache_put($cacheKey, $resolved);
    }
    return $resolved;
}

/**
 * Validate updated birth particulars for any of the 4 astrology services,
 * recalculate the full ephemeris report via AstroEngine, and persist atomically.
 *
 * Returns ['httpStatus' => int, 'body' => array].
 */
function astro_update_order_birth_details(
    \PDO $pdo,
    string $orderId,
    array $body,
    bool $isAdmin,
    string $callerUserId = ''
): array {
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $stmt->execute([$orderId]);
    $orderRow = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$orderRow) {
        return ['httpStatus' => 404, 'body' => ['success' => false, 'message' => 'Order not found.']];
    }

    if (!$isAdmin && (string)($orderRow['user_id'] ?? '') !== $callerUserId) {
        return ['httpStatus' => 403, 'body' => ['success' => false, 'message' => 'Access denied.']];
    }

    // Customers may ONLY fix typos BEFORE approval/delivery so delivered reports
    // remain frozen as ordered and can never be reused for another person.
    $statusUpper = strtoupper(trim((string)($orderRow['status'] ?? '')));
    $emailUpper = strtoupper(trim((string)($orderRow['email_status'] ?? '')));
    if (!$isAdmin) {
        if (!in_array($statusUpper, ['PENDING', 'PENDING_APPROVAL'], true) || $emailUpper === 'SENT') {
            return [
                'httpStatus' => 409,
                'body' => [
                    'success' => false,
                    'code' => 'ORDER_ALREADY_DELIVERED',
                    'message' => 'Delivered reports are locked as ordered. Please contact admin@astrosivam.com if you need assistance.'
                ]
            ];
        }
    }

    $itemId = isset($body['itemId']) && is_numeric($body['itemId']) ? (int)$body['itemId'] : 0;
    $itemRow = null;
    if ($itemId > 0) {
        $iStmt = $pdo->prepare("SELECT * FROM order_items WHERE id = ? AND order_id = ? LIMIT 1");
        $iStmt->execute([$itemId, $orderId]);
        $itemRow = $iStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$itemRow) {
            return ['httpStatus' => 404, 'body' => ['success' => false, 'message' => 'Order item not found.']];
        }
    }

    $serviceType = strtoupper(trim((string)($itemRow['service_code'] ?? $orderRow['service_type'] ?? 'BIRTH_JATHAGAM')));
    $existingPayload = json_decode((string)($itemRow['input_payload'] ?? $orderRow['input_payload'] ?? '{}'), true);
    if (!is_array($existingPayload)) {
        $existingPayload = [];
    }

    $incomingPayload = isset($body['inputPayload']) && is_array($body['inputPayload'])
        ? array_merge($existingPayload, $body['inputPayload'])
        : $existingPayload;

    // Normalize top-level person fields cleanly
    if (isset($incomingPayload['name'])) {
        $incomingPayload['name'] = trim(preg_replace('/\s+/u', ' ', (string)$incomingPayload['name']) ?? '');
    }

    // Validate & recalculate with AstroEngine
    if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
        $brideProblem = AstroEngine::describeBirthDetailsProblem(is_array($incomingPayload['bride'] ?? null) ? $incomingPayload['bride'] : null);
        $groomProblem = AstroEngine::describeBirthDetailsProblem(is_array($incomingPayload['groom'] ?? null) ? $incomingPayload['groom'] : null);
        if ($brideProblem !== null || $groomProblem !== null) {
            $detail = trim(($brideProblem !== null ? 'Bride: ' . $brideProblem : '') . ' ' . ($groomProblem !== null ? 'Groom: ' . $groomProblem : ''));
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Invalid marriage birth details. ' . $detail]];
        }
        $calculatedResult = AstroEngine::calculateMatchmaking($incomingPayload);
        $displayUserName = trim((string)($incomingPayload['groom']['name'] ?? '')) . ' & ' . trim((string)($incomingPayload['bride']['name'] ?? ''));
        $displayCountry = trim((string)($incomingPayload['groom']['country'] ?? $orderRow['country'] ?? ''));
    } elseif ($serviceType === 'MUHURTHAM') {
        $birthProblem = AstroEngine::describeBirthDetailsProblem($incomingPayload);
        if ($birthProblem !== null) {
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Invalid birth details: ' . $birthProblem]];
        }
        $mLat = $incomingPayload['muhurthamLatitude'] ?? null;
        $mLng = $incomingPayload['muhurthamLongitude'] ?? null;
        $mOff = $incomingPayload['muhurthamTimezoneOffsetHours'] ?? null;
        if (empty($incomingPayload['muhurthamPlace'])
            || !is_numeric($mLat) || abs((float)$mLat) > 90
            || !is_numeric($mLng) || abs((float)$mLng) > 180
            || !is_numeric($mOff) || abs((float)$mOff) > 14
        ) {
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Valid Muhurtham event place, coordinates, and timezone are required.']];
        }
        if (!empty($incomingPayload['partner']) && is_array($incomingPayload['partner'])) {
            $pProblem = AstroEngine::describeBirthDetailsProblem($incomingPayload['partner']);
            if ($pProblem !== null) {
                return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Invalid bride birth details: ' . $pProblem]];
            }
        }
        $calculatedResult = AstroEngine::calculateMuhurtham($incomingPayload);
        $displayUserName = trim((string)($incomingPayload['name'] ?? $orderRow['user_name'] ?? ''));
        $displayCountry = trim((string)($incomingPayload['country'] ?? $orderRow['country'] ?? ''));
    } elseif ($serviceType === 'BABY_NAMING') {
        $birthProblem = AstroEngine::describeBirthDetailsProblem($incomingPayload);
        if ($birthProblem !== null) {
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Invalid baby birth details: ' . $birthProblem]];
        }
        $calculatedResult = AstroEngine::calculateBabyNaming($incomingPayload);
        $displayUserName = trim((string)($incomingPayload['name'] ?? $orderRow['user_name'] ?? ''));
        $displayCountry = trim((string)($incomingPayload['country'] ?? $orderRow['country'] ?? ''));
    } else {
        $birthProblem = AstroEngine::describeBirthDetailsProblem($incomingPayload);
        if ($birthProblem !== null) {
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Invalid birth details: ' . $birthProblem]];
        }
        if (trim((string)($incomingPayload['name'] ?? '')) === '') {
            return ['httpStatus' => 400, 'body' => ['success' => false, 'message' => 'Full name is required.']];
        }
        $calculatedResult = AstroEngine::calculateHoroscope($incomingPayload);
        $displayUserName = trim((string)($incomingPayload['name'] ?? $orderRow['user_name'] ?? ''));
        $displayCountry = trim((string)($incomingPayload['country'] ?? $orderRow['country'] ?? ''));
    }

    $encodedInput = json_encode($incomingPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $encodedResult = json_encode($calculatedResult, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($itemRow) {
        $itemSets = ['person_name = ?', 'input_payload = ?', 'calculated_result = ?'];
        $itemParams = [
            $displayUserName !== '' ? $displayUserName : ($itemRow['person_name'] ?? ''),
            $encodedInput,
            $encodedResult,
        ];
        if (array_key_exists('report_snapshot', $itemRow)) {
            $itemSets[] = 'report_snapshot = NULL';
        }
        if (array_key_exists('updated_at', $itemRow)) {
            $itemSets[] = 'updated_at = CURRENT_TIMESTAMP';
        }
        $itemParams[] = $itemId;
        $itemParams[] = $orderId;
        $uItem = $pdo->prepare('UPDATE order_items SET ' . implode(', ', $itemSets) . ' WHERE id = ? AND order_id = ?');
        $uItem->execute($itemParams);
    } else {
        // Clear any stale cached report_snapshot so the next preview / email send
        // builds cleanly from the newly recalculated astronomical data.
        $orderSets = ['user_name = ?', 'input_payload = ?', 'calculated_result = ?'];
        $orderParams = [
            $displayUserName !== '' ? $displayUserName : ($orderRow['user_name'] ?? ''),
            $encodedInput,
            $encodedResult,
        ];
        if (array_key_exists('country', $orderRow)) {
            $orderSets[] = 'country = ?';
            $orderParams[] = $displayCountry !== '' ? $displayCountry : ($orderRow['country'] ?? '');
        }
        if (array_key_exists('report_snapshot', $orderRow)) {
            $orderSets[] = 'report_snapshot = NULL';
        }
        if (array_key_exists('updated_at', $orderRow)) {
            $orderSets[] = 'updated_at = CURRENT_TIMESTAMP';
        }
        $orderParams[] = $orderId;
        $uOrder = $pdo->prepare('UPDATE orders SET ' . implode(', ', $orderSets) . ' WHERE id = ?');
        $uOrder->execute($orderParams);
    }

    if ($isAdmin) {
        try {
            $logStmt = $pdo->prepare(
                "INSERT INTO admin_logs (admin_id, action_type, target_order_id, details) VALUES (?, 'EDIT_BIRTH_DETAILS', ?, ?)"
            );
            $logStmt->execute([
                (string)$callerUserId,
                $orderId,
                json_encode([
                    'serviceType' => $serviceType,
                    'itemId' => $itemRow ? $itemId : null,
                    'userName' => $displayUserName,
                ]),
            ]);
        } catch (\Throwable $e) {
            // Non-fatal if audit table differs in test environments.
        }
    }

    $refreshStmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $refreshStmt->execute([$orderId]);
    $updatedRow = $refreshStmt->fetch(\PDO::FETCH_ASSOC) ?: $orderRow;

    return [
        'httpStatus' => 200,
        'body' => [
            'success' => true,
            'message' => 'Birth details updated and astrological chart recalculated.',
            'inputPayload' => $incomingPayload,
            'calculatedResult' => $calculatedResult,
            'order' => [
                'id' => $updatedRow['id'] ?? $orderId,
                'orderNumber' => $updatedRow['order_number'] ?? '',
                'groupId' => $updatedRow['group_id'] ?? null,
                'userId' => $updatedRow['user_id'] ?? '',
                'userName' => $updatedRow['user_name'] ?? '',
                'userEmail' => $updatedRow['user_email'] ?? '',
                'userMobile' => $updatedRow['user_mobile'] ?? '',
                'country' => $updatedRow['country'] ?? $displayCountry,
                'serviceType' => $updatedRow['service_type'] ?? $serviceType,
                'language' => $updatedRow['language'] ?? 'en',
                'amount' => (float)($updatedRow['amount'] ?? 0),
                'currency' => $updatedRow['currency'] ?? 'INR',
                'status' => $updatedRow['status'] ?? '',
                'emailStatus' => $updatedRow['email_status'] ?? '',
                'inputPayload' => json_decode((string)($updatedRow['input_payload'] ?? '{}'), true) ?: [],
                'calculatedResult' => json_decode((string)($updatedRow['calculated_result'] ?? '{}'), true) ?: null,
                'createdAt' => $updatedRow['created_at'] ?? '',
                'updatedAt' => $updatedRow['updated_at'] ?? ($updatedRow['created_at'] ?? ''),
            ],
        ],
    ];
}
