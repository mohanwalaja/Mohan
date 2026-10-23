<?php
/**
 * ASTRO SIVAM - Pure PHP Vedic Ephemeris & Calculation Engine
 * 100% Standalone - No external node or python dependencies required
 */

// Load Composer autoloader (Smalot PDF parser used by the AI report importer).
if (is_file(__DIR__ . '/../../vendor/autoload.php')) {
    require_once __DIR__ . '/../../vendor/autoload.php';
}

require_once __DIR__ . '/report_views.php';
require_once __DIR__ . '/namakaran_meanings.php';
require_once __DIR__ . '/namakaran_meaning_localizer.php';

require_once __DIR__ . '/engine/birth_instant.php';
require_once __DIR__ . '/engine/ephemeris.php';
require_once __DIR__ . '/engine/dasha_and_porutham.php';
require_once __DIR__ . '/engine/dignity_and_horoscope.php';
require_once __DIR__ . '/engine/matchmaking.php';
require_once __DIR__ . '/engine/namakaran.php';
require_once __DIR__ . '/engine/muhurtham_and_rebuild.php';

class AstroEngine
{
    use AstroEngineBirthInstantTrait;
    use AstroEngineEphemerisTrait;
    use AstroEngineDashaPoruthamTrait;
    use AstroEngineHoroscopeTrait;
    use AstroEngineMatchmakingTrait;
    use AstroEngineNamakaranTrait;
    use AstroEngineMuhurthamTrait;

    private const J2000 = 2451545.0;
    /** Light-time for one astronomical unit, in days (IAU 2012 AU, c = 299 792.458 km/s). */
    private const LIGHT_TIME_PER_AU_DAYS = 0.0057755183;
    private const SPEED_OF_LIGHT_KM_PER_DAY = 299792.458 * 86400.0;
    /**
     * Lahiri (Chitra Paksha) MEAN ayanamsa at J2000.0 TT in degrees = 23°51′25.53″.
     * This is Swiss Ephemeris SIDM_LAHIRI without nutation; adding Δψ gives the
     * "true" ayanamsa (23°51′11.6″ at J2000) printed by Drik Panchang.
     */
    private const LAHIRI_AYANAMSA_J2000 = 23.857092334;

    /** Combustion orbs (degrees from the Sun), mirrored from the TypeScript engine. */
    private const COMBUSTION_LIMITS = [
        'moon' => 12.0, 'mars' => 17.0, 'mercury' => 14.0, 'jupiter' => 11.0, 'venus' => 10.0, 'saturn' => 15.0,
    ];


    /** Rahu/Ketu conventions (see nodeType()). */
    public const NODE_TYPE_TRUE = 'TRUE';
    public const NODE_TYPE_MEAN = 'MEAN';

    /** @var string|null Runtime override of the configured node type (tests / admin tooling). */
    private static $nodeTypeOverride = null;

    /** @var array<string,mixed>|null */
    private static $ephemerisTables = null;


    private static $NAK_GANA = [0,1,2,1,0,1,0,0,2,2,1,1,0,2,0,2,0,2,2,1,1,0,2,2,1,1,0];
    private static $NAK_YONI = [
        ['horse','m'],['elephant','f'],['goat','f'],['serpent','m'],['serpent','f'],['dog','f'],
        ['cat','f'],['goat','m'],['cat','m'],['rat','m'],['rat','f'],['cow','m'],
        ['buffalo','f'],['tiger','f'],['buffalo','m'],['tiger','m'],['deer','f'],['deer','m'],
        ['dog','m'],['monkey','m'],['mongoose','m'],['monkey','f'],['lion','f'],['horse','f'],
        ['lion','m'],['cow','f'],['elephant','m']
    ];
    private static $YONI_FRIEND = [
        'horse'=>['elephant'],'elephant'=>['horse'],'goat'=>['elephant'],'serpent'=>['goat'],
        'dog'=>['cat'],'cat'=>['dog'],'rat'=>['cat'],'cow'=>['tiger'],'buffalo'=>['horse'],
        'tiger'=>['cow'],'deer'=>['serpent'],'monkey'=>['tiger'],'mongoose'=>[],'lion'=>['monkey'],
    ];
    private static $YONI_ENEMY = [
        'horse'=>['dog'],'elephant'=>['lion'],'goat'=>['monkey'],'serpent'=>['mongoose'],
        'dog'=>['horse','deer','monkey'],'cat'=>['monkey'],'rat'=>['buffalo'],'cow'=>['dog'],
        'buffalo'=>['tiger'],'tiger'=>['elephant'],'deer'=>['dog'],'monkey'=>['dog','cat'],
        'mongoose'=>[],'lion'=>['elephant'],
    ];

    private static $VASYA_GROUP = [0,0,1,2,1,3,1,4,1,0,2,2];
    private static $VEDHA_PAIR = [17,16,15,14,22,21,20,19,18,26,25,24,23,null,3,2,1,0,8,7,6,5,4,12,11,10,9];


    /**
     * Houses (whole-sign, counted from a reference rasi) that constitute
     * Sevvay/Kuja Dosha.
     *
     * DEFAULT = the South Indian (Tamil) rule: 2, 4, 7, 8 and 12 from the Lagna,
     * the Moon and Venus. The 1st house is deliberately NOT part of this rule
     * set; ASTRO_KUJA_HOUSES can override the list (e.g.
     * ASTRO_KUJA_HOUSES=1,2,4,7,8,12 for the North Indian / BPHS reading).
     */
    private const KUJA_DOSHA_HOUSES = [2, 4, 7, 8, 12];


    /**
     * House-specific signs in which Mars does NOT cause Kuja Dosha (the Tamil
     * Sevvai Dosha Vilakku lists: Sakthi Vikatan "செவ்வாய் தோஷம் விதிவிலக்குகள்",
     * Tirumana Porutham's twelve exemptions, neerkondar's top-10 exemptions).
     * Keys are the house of Mars counted from the reference point; values are
     * 1-based rasi numbers (Mesham = 1 … Meenam = 12).
     *   1st  : Mesham/Viruchigam (own), Magaram (exalted)           → via own/exalted rule
     *   2nd  : Mithunam, Kanni (Budha's signs) — Kadagam is NOT exempt here: the
     *          Tamil lists name Mithunam/Kanni only (astroved is the lone list
     *          that adds Kadagam; the majority reading was chosen)
     *   4th  : Mesham, Viruchigam (own)                              → via own rule
     *   7th  : Kadagam, Magaram (debilitation/exaltation axis)
     *   8th  : Dhanusu, Meenam (Guru's signs)
     *   12th : Rishabam, Thulam (Sukra's signs)
     * Simham (Leo) and Kumbam (Aquarius) are exempt in every dosha house.
     */
    private const KUJA_HOUSE_SIGN_EXCEPTIONS = [
        2 => [3, 6],
        7 => [4, 10],
        8 => [9, 12],
        12 => [2, 7],
    ];
    private const KUJA_UNIVERSAL_SIGN_EXCEPTIONS = [5, 11]; // Simham, Kumbam


    public static $NAKSHATRAS_EN = [
        'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashirsha', 'Arudra',
        'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
        'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
        'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
        'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
    ];

    public static $NAKSHATRAS_TA = [
        'அஸ்வினி', 'பரணி', 'கிருத்திகை', 'ரோகிணி', 'மிருகசீரிடம்', 'திருவாதிரை',
        'புனர்பூசம்', 'பூசம்', 'ஆயில்யம்', 'மகம்', 'பூரம்', 'உத்திரம்',
        'அஸ்தம்', 'சித்திரை', 'சுவாதி', 'விசாகம்', 'அனுஷம்', 'கேட்டை',
        'மூலம்', 'பூராடம்', 'உத்திராடம்', 'திருவோணம்', 'அவிட்டம்', 'சதயம்',
        'பூரட்டாதி', 'உத்திரட்டாதி', 'ரேவதி'
    ];

    /**
     * Hindi nakshatra names, index-aligned with $NAKSHATRAS_EN. Same list the
     * browser engine uses (NAKSHATRAM_NAMES_HI in src/lib/astrology/astronomy.ts),
     * so a Hindi preview and a Hindi PDF name the same star. Without it the
     * Hindi page-1 "Nakshatra" row fell back to "N/A".
     */
    public static $NAKSHATRAS_HI = [
        'अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा',
        'पुनर्वसु', 'पुष्य', 'आश्लेषा', 'मघा', 'पूर्वाफाल्गुनी', 'उत्तराफाल्गुनी',
        'हस्त', 'चित्रा', 'स्वाति', 'विशाखा', 'अनुराधा', 'ज्येष्ठा',
        'मूल', 'पूर्वाषाढ़ा', 'उत्तराषाढ़ा', 'श्रवण', 'धनिष्ठा', 'शतभिषा',
        'पूर्वाभाद्रपद', 'उत्तराभाद्रपद', 'रेवती'
    ];

    public static $RASIS = [
        ['en' => 'Mesham (Aries)', 'ta' => 'மேஷம்', 'lord' => 'Mars', 'lordTa' => 'செவ்வாய்', 'hi' => 'मेष (Aries)'],
        ['en' => 'Rishabam (Taurus)', 'ta' => 'ரிஷபம்', 'lord' => 'Venus', 'lordTa' => 'சுக்கிரன்', 'hi' => 'वृषभ (Taurus)'],
        ['en' => 'Mithunam (Gemini)', 'ta' => 'மிதுனம்', 'lord' => 'Mercury', 'lordTa' => 'புதன்', 'hi' => 'मिथुन (Gemini)'],
        ['en' => 'Kadagam (Cancer)', 'ta' => 'கடகம்', 'lord' => 'Moon', 'lordTa' => 'சந்திரன்', 'hi' => 'कर्क (Cancer)'],
        ['en' => 'Simham (Leo)', 'ta' => 'சிம்மம்', 'lord' => 'Sun', 'lordTa' => 'சூரியன்', 'hi' => 'सिंह (Leo)'],
        ['en' => 'Kanni (Virgo)', 'ta' => 'கன்னி', 'lord' => 'Mercury', 'lordTa' => 'புதன்', 'hi' => 'कन्या (Virgo)'],
        ['en' => 'Thulam (Libra)', 'ta' => 'துலாம்', 'lord' => 'Venus', 'lordTa' => 'சுக்கிரன்', 'hi' => 'तुला (Libra)'],
        ['en' => 'Viruchigam (Scorpio)', 'ta' => 'விருச்சிகம்', 'lord' => 'Mars', 'lordTa' => 'செவ்வாய்', 'hi' => 'वृश्चिक (Scorpio)'],
        ['en' => 'Dhanusu (Sagittarius)', 'ta' => 'தனுசு', 'lord' => 'Jupiter', 'lordTa' => 'குரு', 'hi' => 'धनु (Sagittarius)'],
        ['en' => 'Magaram (Capricorn)', 'ta' => 'மகரம்', 'lord' => 'Saturn', 'lordTa' => 'சனி', 'hi' => 'मकर (Capricorn)'],
        ['en' => 'Kumbam (Aquarius)', 'ta' => 'கும்பம்', 'lord' => 'Saturn', 'lordTa' => 'சனி', 'hi' => 'कुंभ (Aquarius)'],
        ['en' => 'Meenam (Pisces)', 'ta' => 'மீனம்', 'lord' => 'Jupiter', 'lordTa' => 'குரு', 'hi' => 'मीन (Pisces)']
    ];

    // ------------------------------------------------------------------
    // Items 3/4/6/7 — dignity, Neecha Bhanga, Graha Yuddha, Kendradhipati,
    // yoga notes and the next Mahadasa. Every table below mirrors
    // src/lib/astrology/dignity.ts and the TypeScript engine value-for-value, so a
    // PHP-rendered PDF can never disagree with the browser preview.
    // ------------------------------------------------------------------
    private const DIGNITY_EXALTATION_SIGN = ['sun' => 1, 'moon' => 2, 'mars' => 10, 'mercury' => 6, 'jupiter' => 4, 'venus' => 12, 'saturn' => 7];
    private const DIGNITY_OWN_SIGNS = [
        'sun' => [5], 'moon' => [4], 'mars' => [1, 8], 'mercury' => [3, 6],
        'jupiter' => [9, 12], 'venus' => [2, 7], 'saturn' => [10, 11],
    ];
    private const DIGNITY_SIGN_LORDS = [1 => 'mars', 2 => 'venus', 3 => 'mercury', 4 => 'moon', 5 => 'sun', 6 => 'mercury', 7 => 'venus', 8 => 'mars', 9 => 'jupiter', 10 => 'saturn', 11 => 'saturn', 12 => 'jupiter'];
    private const DIGNITY_SIGN_EXALTED_BY = [1 => 'sun', 2 => 'moon', 4 => 'jupiter', 6 => 'mercury', 7 => 'saturn', 10 => 'mars', 12 => 'venus'];
    private const DIGNITY_GRAHA_TEXT = [
        'sun' => ['en' => 'Sun', 'ta' => 'சூரியன்', 'hi' => 'सूर्य'],
        'moon' => ['en' => 'Moon', 'ta' => 'சந்திரன்', 'hi' => 'चंद्र'],
        'mars' => ['en' => 'Mars', 'ta' => 'செவ்வாய்', 'hi' => 'मंगल'],
        'mercury' => ['en' => 'Mercury', 'ta' => 'புதன்', 'hi' => 'बुध'],
        'jupiter' => ['en' => 'Jupiter', 'ta' => 'குரு', 'hi' => 'गुरु'],
        'venus' => ['en' => 'Venus', 'ta' => 'சுக்கிரன்', 'hi' => 'शुक्र'],
        'saturn' => ['en' => 'Saturn', 'ta' => 'சனி', 'hi' => 'शनि'],
        'rahu' => ['en' => 'Rahu', 'ta' => 'ராகு', 'hi' => 'राहु'],
        'ketu' => ['en' => 'Ketu', 'ta' => 'கேது', 'hi' => 'केतु'],
    ];


    /** Muhurtham scan contract version — mirrors MUHURTHAM_ALGORITHM_VERSION in scanner.ts. */
    public const MUHURTHAM_ALGORITHM_VERSION = 6;

}
