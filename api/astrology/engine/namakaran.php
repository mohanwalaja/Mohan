<?php
/**
 * ASTRO SIVAM — Namakaran Baby Naming Calculation & Syllable Bank
 */

trait AstroEngineNamakaranTrait
{
    /**
     * The report uses the 108 traditional Namakshara sounds: one sound for
     * each of the four padas in all 27 Nakshatras. Keep this data separate
     * from the calculation code so every PHP report path resolves the same
     * complete table rather than falling back to Ashwini syllables.
     */
    private static function getBabyNakshatraLetterTable() {
        static $letterTable = null;

        if ($letterTable !== null) {
            return $letterTable;
        }

        $dataPath = dirname(__DIR__) . '/baby_nakshatra_letters.json';
        $decoded = is_file($dataPath) ? json_decode((string) file_get_contents($dataPath), true) : null;
        if (!is_array($decoded) || count($decoded) !== 27) {
            throw new RuntimeException('The complete 27-Nakshatra baby naming syllable table is unavailable.');
        }

        // Index the table by the one-based Janma Nakshatra number. This makes
        // a missing/out-of-order entry fail safely instead of silently using
        // the first (Ashwini) row for every child.
        $letterTable = [];
        foreach ($decoded as $entry) {
            $index = intval($entry['nakshatraIndex'] ?? 0);
            if ($index < 1 || $index > 27 || !is_array($entry['padas'] ?? null) || count($entry['padas']) !== 4) {
                throw new RuntimeException('The baby naming syllable table contains an invalid Nakshatra entry.');
            }
            $group = self::rajjuTable()['groups'][$index - 1];
            foreach (['En' => 'en', 'Ta' => 'ta', 'Hi' => 'hi'] as $suffix => $language) {
                $entry['rajju' . $suffix] = self::rajjuTable()[$language][$group];
            }
            $letterTable[$index] = $entry;
        }

        if (count($letterTable) !== 27) {
            throw new RuntimeException('The baby naming syllable table is incomplete.');
        }

        return $letterTable;
    }

    /** Localize a page-2 meaning for the language of the ordered report. */
    public static function localizeNamakaranMeaning($meaning, $language = 'en'): string {
        $language = strtolower(trim((string) $language));
        if (!in_array($language, ['en', 'ta', 'hi'], true)) {
            $language = 'en';
        }
        return astro_localize_namakaran_meaning($meaning, $language);
    }

    /**
     * The curated Namakaran bank (page 2 of the report), generated from
     * data/namakaran_name_bank.psv by scripts/build_namakaran_bank.mjs. Every
     * entry carries its own Tamil and Hindi spelling.
     * The TypeScript twin of this file is src/lib/astrology/namakaranNameBank.ts
     * and both carry the same content hash, so the live preview and the
     * emailed report can never drift apart.
     */
    private static function getNamakaranNameBank() {
        static $bank = null;

        if ($bank !== null) {
            return $bank;
        }

        $path = dirname(__DIR__) . '/namakaran_name_bank.php';
        $loaded = is_file($path) ? require $path : null;
        if (!is_array($loaded) || !is_array($loaded['bank'] ?? null)) {
            $loaded = ['bank' => [], 'maxPerSide' => 8];
        }
        $bank = $loaded;
        return $bank;
    }

    /**
     * Collect names from one exact akshara only. Bank entries whose
     * transliterated first sound does not match the displayed pada sound are
     * omitted; short lists are intentionally not topped up with alternatives.
     */
    private static function collectNamakaranNames($akshara, $style, $gender, &$used, $limit, $bank) {
        $names = [];
        $entries = $bank[$akshara][$gender][$style] ?? [];
        if (!is_array($entries)) {
            return $names;
        }

        foreach ($entries as $entry) {
            if (count($names) >= $limit) {
                break;
            }
            // Bank entries are [roman, tamil, hindi, meaning]. The hand-written
            // Tamil spelling is the authority: it must open with the exact pada
            // letter, and it is printed as-is (never machine-transliterated).
            $name = (string) ($entry[0] ?? '');
            $tamilName = (string) ($entry[1] ?? '');
            $hindiName = (string) ($entry[2] ?? '');
            if ($name === '' || $tamilName === '' || !AstroReportViews::tamilNameMatchesPada($tamilName, $akshara)) {
                continue;
            }
            $fingerprint = $tamilName;
            $romanKey = 'roman|' . strtolower(trim($name));
            if (isset($used[$fingerprint]) || isset($used[$romanKey])) {
                continue;
            }
            $used[$fingerprint] = true;
            $used[$romanKey] = true;
            $meaning = (string) ($entry[3] ?? '');
            $names[] = [
                'name' => $name,
                'nameTa' => $tamilName,
                'nameHi' => $hindiName,
                'meaning' => $meaning,
                'meaningEn' => $meaning,
                'meaningTa' => self::localizeNamakaranMeaning($meaning, 'ta'),
                'meaningHi' => self::localizeNamakaranMeaning($meaning, 'hi'),
                'sourceAksharaTa' => $akshara
            ];
        }
        return $names;
    }

    /**
     * Builds the South + North Indian name columns for every pada of the birth
     * star, for the baby's own gender. Each column contains exact sound matches
     * from its own akshara only and may contain fewer than the requested limit.
     */
    public static function getBabyNameSuggestionsByPada($padas, $gender, $maxPerSide = 15) {
        $data = self::getNamakaranNameBank();
        $bank = $data['bank'];
        $maxPerSide = max(1, min(8, intval($maxPerSide)));
        $gender = strtoupper((string) $gender) === 'F' ? 'F' : 'M';
        $used = [];
        $columns = [];

        foreach ((array) $padas as $pada) {
            $akshara = (string) ($pada['letterTa'] ?? '');
            $columns[] = [
                'padaNumber' => intval($pada['padaNumber'] ?? 0),
                'soundTa' => $akshara,
                'soundEn' => (string) ($pada['letterEn'] ?? ''),
                'soundHi' => (string) ($pada['letterHi'] ?? ''),
                'rasiTa' => (string) ($pada['rasiTa'] ?? ''),
                'rasiEn' => (string) ($pada['rasiEn'] ?? ''),
                'rasiHi' => (string) ($pada['rasiHi'] ?? ''),
                'south' => self::collectNamakaranNames($akshara, 'south', $gender, $used, $maxPerSide, $bank),
                'north' => self::collectNamakaranNames($akshara, 'north', $gender, $used, $maxPerSide, $bank)
            ];
        }
        return $columns;
    }

    /**
     * Only return name examples that actually begin with the birth-pada
     * phonetic sound. The older implementation supplied the same L/A names
     * to every report, which made a correct sound such as "Ve" look wrong.
     */
    private static function getBabyNameExamples($primarySyllable, $gender) {
        $prefix = trim(explode('/', (string) $primarySyllable)[0]);
        $key = strtolower(preg_replace('/[^a-z]/i', '', $prefix));
        $gender = strtoupper((string) $gender) === 'F' ? 'F' : 'M';

        $examples = [
            've' => [
                'M' => [['Vedant', 'Ultimate wisdom; the conclusion of the Vedas'], ['Venkatesh', 'Lord of Venkata, an aspect of Vishnu']],
                'F' => [['Vedika', 'Sacred knowledge; altar of the Vedas'], ['Veena', 'A sacred musical instrument; melody']],
            ],
            'vo' => [
                'M' => [['Vohit', 'One who brings light and awakening']],
                'F' => [['Voshini', 'One who brings joy and contentment']],
            ],
            'kaa' => [
                'M' => [['Karthik', 'Karthikeyan (Murugan); one born in Karthikai']],
                'F' => [['Kavya', 'Poetry; a graceful literary creation']],
            ],
            'kee' => [
                'M' => [['Kiran', 'Ray of light']],
                'F' => [['Keerthi', 'Fame, honour and good reputation']],
            ],
            'chu' => [
                'M' => [['Chudamani', 'Crest jewel; one of great brilliance']],
                'F' => [['Chudamani', 'A precious crown jewel']],
            ],
            'che' => [
                'M' => [['Chetan', 'Conscious, intelligent spirit']],
                'F' => [['Chetana', 'Consciousness; living spirit']],
            ],
            'cho' => [
                'M' => [['Chola', 'A name associated with the ancient Tamil dynasty']],
                'F' => [['Cholai', 'A flourishing grove']],
            ],
            'la' => [
                'M' => [['Lakshman', 'One with auspicious signs']],
                'F' => [['Lalitha', 'Graceful, charming and playful']],
            ],
        ];

        $selected = $examples[$key][$gender] ?? [];
        return array_map(function ($example) use ($primarySyllable, $gender) {
            // The meaning of these example names is printed by the Tamil and
            // Hindi sheets too; it used to be the English string copied into
            // `meaningTa` / `meaningHi`. The curated glossary localizes it.
            return [
                'nameEn' => $example[0],
                'nameTa' => $example[0],
                'nameHi' => $example[0],
                'gender' => $gender,
                'meaningEn' => $example[1],
                'meaningTa' => self::localizeNamakaranMeaning($example[1], 'ta'),
                'meaningHi' => self::localizeNamakaranMeaning($example[1], 'hi'),
                'startingLetter' => $primarySyllable,
            ];
        }, $selected);
    }

    public static function isCurrentBabyNamingResult($result) {
        return is_array($result)
            && intval($result['babyNamingAlgorithmVersion'] ?? 0) === 2
            && intval($result['janmaNakshatraIndex'] ?? 0) >= 1
            && intval($result['janmaNakshatraIndex'] ?? 0) <= 27
            && intval($result['janmaPada'] ?? 0) >= 1
            && intval($result['janmaPada'] ?? 0) <= 4
            && is_array($result['nakshatraLetters']['padas'] ?? null)
            && count($result['nakshatraLetters']['padas']) === 4
            && !empty($result['primaryPadaInfo']['letterEn']);
    }

    /** A stored Muhurtham result is reusable only with the current location-aware shape and a non-empty calendar. */
    public static function isCurrentMuhurthamResult($result) {
        return is_array($result)
            && intval($result['muhurthamAlgorithmVersion'] ?? 0) === self::MUHURTHAM_ALGORITHM_VERSION
            && is_array($result['months'] ?? null)
            && count($result['months']) > 0
            && !empty($result['muhurthamPlace'])
            && is_numeric($result['muhurthamLatitude'] ?? null) && (float) $result['muhurthamLatitude'] >= -90 && (float) $result['muhurthamLatitude'] <= 90
            && is_numeric($result['muhurthamLongitude'] ?? null) && (float) $result['muhurthamLongitude'] >= -180 && (float) $result['muhurthamLongitude'] <= 180
            && is_numeric($result['muhurthamTimezoneOffsetHours'] ?? null) && (float) $result['muhurthamTimezoneOffsetHours'] >= -14 && (float) $result['muhurthamTimezoneOffsetHours'] <= 14;
    }

    /** A user-provided label is not a certified birth-pada-compatible name. */
    public static function getBabyNameProvenance($name): array {
        $suppliedName = trim((string) $name);
        return [
            'suppliedName' => $suppliedName !== '' ? $suppliedName : null,
            'status' => $suppliedName !== '' ? 'SUPPLIED_NOT_CERTIFIED' : 'NOT_SUPPLIED',
            'noteEn' => $suppliedName !== ''
                ? 'The supplied name has not been certified as matching the birth-pada sound. Use the primary sound when choosing a compatible name; related-sound alternatives require separate consideration.'
                : 'No name was supplied. Use the primary birth-pada sound when choosing a name; related-sound alternatives require separate consideration.',
            'noteTa' => $suppliedName !== ''
                ? 'வழங்கப்பட்ட பெயர் பிறந்த பாத ஒலிக்குப் பொருந்துவதாகச் சான்றளிக்கப்படவில்லை. பொருத்தமான பெயரைத் தேர்ந்தெடுக்க முதன்மை ஒலியைப் பயன்படுத்தவும்; தொடர்புடைய மாற்று ஒலிப் பெயர்களைத் தனியாகப் பரிசீலிக்க வேண்டும்.'
                : 'பெயர் வழங்கப்படவில்லை. பெயரைத் தேர்ந்தெடுக்க பிறந்த பாதத்தின் முதன்மை ஒலியைப் பயன்படுத்தவும்; தொடர்புடைய மாற்று ஒலிப் பெயர்களைத் தனியாகப் பரிசீலிக்க வேண்டும்.',
            'noteHi' => $suppliedName !== ''
                ? 'दिए गए नाम को जन्म-पाद की ध्वनि से मेल खाने वाला प्रमाणित नहीं किया गया है। अनुकूल नाम चुनते समय प्राथमिक ध्वनि का प्रयोग करें; संबंधित ध्वनि वाले विकल्पों पर अलग से विचार आवश्यक है।'
                : 'कोई नाम नहीं दिया गया है। नाम चुनते समय जन्म-पाद की प्राथमिक ध्वनि का प्रयोग करें; संबंधित ध्वनि वाले विकल्पों पर अलग से विचार आवश्यक है।'
        ];
    }

    public static function calculateBabyNaming($payload) {
        $horoscope = self::calculateHoroscope($payload);
        $gender = strtoupper((string) ($payload['gender'] ?? 'M')) === 'F' ? 'F' : 'M';
        $starIndex = intval($horoscope['janmaNakshatraIndex'] ?? -1) + 1;
        $rawPada = $horoscope['janmaPada'] ?? null;
        if (!is_numeric($rawPada) || (float) $rawPada !== (float) (int) $rawPada || (int) $rawPada < 1 || (int) $rawPada > 4) {
            throw new RuntimeException('Unable to resolve the birth Pada for baby naming.');
        }
        $pada = (int) $rawPada;

        $letterTable = self::getBabyNakshatraLetterTable();
        if (!isset($letterTable[$starIndex])) {
            throw new RuntimeException('Unable to resolve the birth Nakshatra for baby naming.');
        }

        // The padas (and their Rasis) come from the selected Nakshatra table,
        // not a generic first-four-syllables list. For example, Mrigashirsha
        // Pada 1 resolves to Ve / Way, never Chu / Che / Cho / La.
        $nakshatraLetters = $letterTable[$starIndex];
        $padas = $nakshatraLetters['padas'];
        $primaryPadaInfo = null;
        foreach ($padas as $padaInfo) {
            if (intval($padaInfo['padaNumber'] ?? 0) === $pada) {
                $primaryPadaInfo = $padaInfo;
                break;
            }
        }
        if (!$primaryPadaInfo) {
            throw new RuntimeException('Unable to resolve the birth Pada for baby naming.');
        }

        $nakshatraLetters['pada'] = $pada; // Legacy PDF compatibility.
        $syllables = array_values(array_map(function ($padaInfo) {
            return $padaInfo['letterEn'];
        }, $padas));
        $suggestedNames = self::getBabyNameExamples($primaryPadaInfo['letterEn'], $gender);

        // Page 2 of the report: up to 15 South Indian style names (left) and
        // 15 North Indian style names (right) for every pada of the birth star,
        // for the baby's own gender.
        $nameSuggestions = self::getBabyNameSuggestionsByPada($padas, $gender);

        return [
            // Increment this whenever the persisted result shape/rules change.
            // It permits old, incorrect Ashwini-default reports to be safely
            // recalculated from the original birth payload on delivery.
            'babyNamingAlgorithmVersion' => 2,
            'babyHoroscope' => $horoscope,
            'nodeType' => $horoscope['nodeType'] ?? self::nodeType(),
            'gender' => $gender,
            'genderLabelEn' => $gender === 'F' ? 'Female (Girl)' : 'Male (Boy)',
            'startingSyllables' => $syllables,
            'suggestedSyllables' => $syllables,
            'primaryStartingSyllable' => $primaryPadaInfo['letterEn'],
            'recommendedNames' => array_values(array_map(function ($n) { return $n['nameEn']; }, $suggestedNames)),
            'numerologySuggestion' => 'Lucky Compound Numbers: 1, 3, 5, 9',
            'blessing' => 'May the divine light of Lord Shiva and Parvati bless the newborn with longevity, wisdom, and boundless prosperity.',

            'babyName' => $payload['babyName'] ?? ($gender === 'F' ? 'Baby Girl' : 'Baby Boy'),
            'nameProvenance' => self::getBabyNameProvenance($payload['babyName'] ?? $payload['name'] ?? ''),
            'dob' => $horoscope['dob'],
            'tob' => $horoscope['tob'],
            'birthPlace' => $horoscope['birthPlace'],
            'country' => $horoscope['country'],
            'janmaNakshatraIndex' => $starIndex,
            'janmaNakshatraEn' => $horoscope['janmaNakshatraEn'],
            'janmaNakshatraTa' => $horoscope['janmaNakshatraTa'],
            'nakshatraLetters' => $nakshatraLetters,
            'janmaPada' => $pada,
            'primaryPadaInfo' => $primaryPadaInfo,
            'chandraRasi' => $horoscope['chandraRasi'],
            'chandraRasiNameEn' => $horoscope['rasi']['name'],
            'chandraRasiNameTa' => $horoscope['rasi']['nameTa'],
            'chandraRasiNameHi' => $horoscope['rasi']['nameHi'] ?? $horoscope['rasi']['name'],
            'lagnaRasi' => $horoscope['lagnaRasi'],
            'lagnaRasiNameEn' => $horoscope['lagna']['rasi'],
            'lagnaRasiNameTa' => $horoscope['lagna']['rasiTa'],
            'lagnaRasiNameHi' => $horoscope['lagna']['rasiHi'] ?? $horoscope['lagna']['rasi'],
            'suggestedNames' => $suggestedNames,
            'nameSuggestions' => $nameSuggestions,

            'generatedAt' => date('Y-m-d H:i:s'),
            'certifiedBy' => 'ASTRO SIVAM Sanskrit Naming Board'
        ];
    }

}
