<?php
/**
 * ASTRO SIVAM — Shared Report Formatting, Transliteration & Chrome
 */

trait AstroReportSharedTrait
{
    public static function e($str): string {
        return htmlspecialchars((string)$str, ENT_QUOTES, 'UTF-8');
    }

    /**
     * THE date-of-birth format used in every report PDF: DD/MM/YYYY
     * (e.g. "27/07/1990"). Accepts ISO YYYY-MM-DD (optionally with a time
     * suffix), YYYY/MM/DD, or an already day-first DD-MM-YYYY value.
     * Anything unrecognised is returned unchanged (or $fallback when empty).
     */
    public static function birthDate($value, string $fallback = ''): string {
        $raw = trim((string) ($value ?? ''));
        if ($raw === '') { return $fallback; }
        if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T\s])/', $raw, $m)) {
            return str_pad($m[3], 2, '0', STR_PAD_LEFT) . '/' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '/' . $m[1];
        }
        if (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/', $raw, $m)) {
            return str_pad($m[1], 2, '0', STR_PAD_LEFT) . '/' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '/' . $m[3];
        }
        return $raw;
    }

    private static function validRasiNumber($value): ?int {
        if (!is_numeric($value) || (float) $value !== (float) (int) $value || (int) $value < 1 || (int) $value > 12) {
            return null;
        }
        return (int) $value;
    }

    private static function rasiNameForNumber($value, string $lang): string {
        static $names = [
            1 => ['en' => 'Mesham (Aries)', 'ta' => 'மேஷம்', 'hi' => 'मेष'],
            2 => ['en' => 'Rishabam (Taurus)', 'ta' => 'ரிஷபம்', 'hi' => 'वृषभ'],
            3 => ['en' => 'Mithunam (Gemini)', 'ta' => 'மிதுனம்', 'hi' => 'मिथुन'],
            4 => ['en' => 'Kadagam (Cancer)', 'ta' => 'கடகம்', 'hi' => 'कर्क'],
            5 => ['en' => 'Simham (Leo)', 'ta' => 'சிம்மம்', 'hi' => 'सिंह'],
            6 => ['en' => 'Kanni (Virgo)', 'ta' => 'கன்னி', 'hi' => 'कन्या'],
            7 => ['en' => 'Thulam (Libra)', 'ta' => 'துலாம்', 'hi' => 'तुला'],
            8 => ['en' => 'Viruchigam (Scorpio)', 'ta' => 'விருச்சிகம்', 'hi' => 'वृश्चिक'],
            9 => ['en' => 'Dhanusu (Sagittarius)', 'ta' => 'தனுசு', 'hi' => 'धनु'],
            10 => ['en' => 'Magaram (Capricorn)', 'ta' => 'மகரம்', 'hi' => 'मकर'],
            11 => ['en' => 'Kumbam (Aquarius)', 'ta' => 'கும்பம்', 'hi' => 'कुंभ'],
            12 => ['en' => 'Meenam (Pisces)', 'ta' => 'மீனம்', 'hi' => 'मीन'],
        ];
        $rasiNumber = self::validRasiNumber($value);
        return $rasiNumber !== null ? ($names[$rasiNumber][$lang] ?? 'N/A') : 'N/A';
    }

    public static function firstTamilSound(string $text): string {
        preg_match('/^[\x{0B85}-\x{0BB9}][\x{0BBE}-\x{0BCD}\x{0BD7}]?/u', trim($text), $matches);
        return $matches[0] ?? '';
    }

    /**
     * The Tamil pada letter a written name opens with.
     *
     * A name is classified by its first letter plus that letter's vowel sign
     * (சு = Su). A consonant cluster opens with a pulli (ப்ரீதி = Preethi) and
     * belongs to the letter carrying that pulli with the next letter's vowel
     * (பீ), which is how Tamil naming tables file Preethi and Priya. Mirrors
     * tamilPadaCore() in src/lib/astrology/namakaranSound.ts.
     */
    public static function tamilPadaCore(string $text): string {
        $value = trim($text);
        if ($value === '' || !preg_match('/^([\x{0B85}-\x{0BB9}])([\x{0BBE}-\x{0BCD}\x{0BD7}]?)/u', $value, $head)) {
            return '';
        }
        $letter = $head[1];
        $sign = $head[2] ?? '';
        if ($sign !== "\u{0BCD}" && $sign !== '\xE0\xAF\x8D') {
            return $letter . $sign;
        }

        $rest = substr($value, strlen($head[0]));
        for ($guard = 0; $guard < 4; $guard++) {
            if (!preg_match('/^([\x{0B95}-\x{0BB9}])([\x{0BBE}-\x{0BCD}\x{0BD7}]?)/u', $rest, $next)) {
                return $letter;
            }
            $nextSign = $next[2] ?? '';
            if ($nextSign !== "\u{0BCD}" && $nextSign !== '\xE0\xAF\x8D') {
                return $letter . $nextSign;
            }
            $rest = substr($rest, strlen($next[0]));
        }
        return $letter;
    }

    /** True when a hand-written Tamil spelling opens with the exact pada letter. */
    public static function tamilNameMatchesPada(string $tamilName, string $sound): bool {
        $core = self::tamilPadaCore($tamilName);
        if ($core === '') {
            return false;
        }
        foreach (explode('/', $sound) as $option) {
            if ($core === self::tamilPadaCore($option)) {
                return true;
            }
        }
        return false;
    }

    public static function nameMatchesPada(string $name, string $sound): bool {
        $first = self::firstTamilSound(self::transliterateToTamil($name));
        foreach (explode('/', $sound) as $option) {
            if ($first !== '' && $first === self::firstTamilSound($option)) return true;
        }
        return false;
    }

    public static function transliterateToTamil(string $name): string {
        $trimmed = trim($name);
        $lower = strtolower(preg_replace('/[^a-zA-Z]/', '', $trimmed));
        if ($lower === '') return $trimmed;

        static $map = [
            'dushyant' => 'துஷ்யந்த்',
            'revathi' => 'ரேவதி',
            'renuka' => 'ரேணுகா',
            'renugadevi' => 'ரேணுகாதேவி',
            'rethika' => 'ரேதிகா',
            'rekha' => 'ரேகா',
            'reva' => 'ரேவா',
            'rohini' => 'ரோஹிணி',
            'roshini' => 'ரோஷினி',
            'roshni' => 'ரோஷ்னி',
            'rohita' => 'ரோஹிதா',
            'tapan' => 'தபன்',
            'rochak' => 'ரோசக்',
            'reet' => 'ரீத்',
            'roshika' => 'ரோஷிகா',
            'ronika' => 'ரோனிகா',
            'romil' => 'ரோமில்',
            'ronit' => 'ரோனித்',
            'ronak' => 'ரோனக்',
            'rajesh' => 'ராஜேஷ்',
            'rakesh' => 'ரகேஷ்',
            'ramesh' => 'ரமேஷ்',
            'rupesh' => 'ரூபேஷ்',
            'rudhran' => 'ருத்ரன்', 'rudra' => 'ருத்ரா', 'rudramoorthy' => 'ருத்ரமூர்த்தி',
            'rupan' => 'ரூபன்', 'rukesh' => 'ருகேஷ்', 'raman' => 'ராமன்', 'rama' => 'ராமர்', 'ram' => 'ராம்',
            'ravichandran' => 'ரவிச்சந்திரன்', 'ramachandran' => 'ராமச்சந்திரன்',
            'rithik' => 'ரித்திக்', 'rethinavel' => 'ரத்தினவேல்', 'rethik' => 'ரேத்திக்',
            'renjith' => 'ரேஞ்சித்', 'revanth' => 'ரேவந்த்', 'rajan' => 'ராஜன்',
            'ramakrishnan' => 'ராமகிருஷ்ணன்', 'rajarajan' => 'ராஜராஜன்',
            'rithish' => 'ரித்தீஷ்', 'rohan' => 'ரோஹன்', 'rohit' => 'ரோஹித்',
            'rohith' => 'ரோஹித்', 'roshan' => 'ரோஷன்', 'rohinthan' => 'ரோஹிந்தன்',
            'raghav' => 'ராகவ்', 'raghavan' => 'ராகவன்', 'rajendran' => 'ராஜேந்திரன்',
            'raam' => 'ராம்', 'rishikesan' => 'ரிஷிகேசன்', 'rishikesh' => 'ரிஷிகேஷ்',
            'rishi' => 'ரிஷி', 'reyansh' => 'ரேயான்ஷ்', 'revansh' => 'ரேவான்ஷ்',
            'rahul' => 'ராகுல்', 'ravi' => 'ரவி', 'ritvik' => 'ரித்விக்',
            'ridhaan' => 'ரிதான்', 'ritul' => 'ரிதுல்', 'ranveer' => 'ரன்வீர்',
            'rishabh' => 'ரிஷப்', 'tharun' => 'தருண்', 'tarun' => 'தருண்',
            'thangaraj' => 'தங்கராஜ்', 'thangavel' => 'தங்கவேல்', 'thamizharasan' => 'தமிழரசன்',
            'dhanasekaran' => 'தனசேகரன்', 'dharanidharan' => 'தரணிதரன்',
            'thavamani' => 'தவமணி', 'thamodaran' => 'தாமோதரன்', 'thayumanavan' => 'தாயுமானவன்',
            'dhanush' => 'தனுஷ்', 'dheeraj' => 'தீரஜ்', 'dhiraj' => 'திராஜ்',
            'danish' => 'டேனிஷ்', 'dheeman' => 'தீமன்', 'dhir' => 'தீர்',
            'theerth' => 'தீர்த்', 'aarav' => 'ஆரவ்', 'aditya' => 'ஆதித்யா',
            'ananya' => 'அனன்யா', 'anushka' => 'அனுஷ்கா', 'akshay' => 'அக்ஷய்',
            'arjun' => 'அர்ஜுன்', 'abhay' => 'அபய்', 'arnav' => 'அர்ணவ்',
            'anirudh' => 'அனிருத்', 'aryan' => 'ஆர்யன்', 'advait' => 'அத்வைத்',
            'akhil' => 'அகில்', 'ansh' => 'அன்ஷ்', 'amit' => 'அமித்',
            'aanya' => 'ஆனியா', 'aaradhya' => 'ஆராத்யா', 'aditi' => 'அதிதி',
            'akshara' => 'அக்ஷரா', 'anika' => 'அனிகா', 'aadya' => 'ஆத்யா',
            'avni' => 'அவனி', 'amrita' => 'அமிர்தா', 'aisha' => 'ஆயிஷா',
            'arul' => 'அருள்', 'anbu' => 'அன்பு', 'azhagan' => 'அழகன்',
            'aadhavan' => 'ஆதவன்', 'amudhan' => 'அமுதன்', 'amudha' => 'அமுதா',
            'arivazhagan' => 'அறிவழகன்', 'anbarasan' => 'அன்பரசன்', 'arulmozhi' => 'அருள்மொழி',
            'anjali' => 'அஞ்சலி', 'aarthi' => 'ஆர்த்தி', 'abinaya' => 'அபிநயா',
            'anitha' => 'அனிதா', 'aruna' => 'அருணா', 'aadhira' => 'ஆதிரா',
            'anbarasi' => 'அன்பரசி', 'agalya' => 'அகல்யா', 'anusiya' => 'அனுசியா',
            'ilango' => 'இளங்கோ', 'ilamaran' => 'இளமாறன்', 'ilavarasan' => 'இளவரசன்',
            'iniyan' => 'இனியன்', 'ilakkiyan' => 'இலக்கியன்', 'isaiarasu' => 'இசையரசு',
            'ilayarasan' => 'இளையரசன்', 'iniya' => 'இனியா', 'ilakkiya' => 'இலக்கியா',
            'ilamathi' => 'இளமதி', 'inbavalli' => 'இன்பவள்ளி', 'isaiyarasi' => 'இசையரசி',
            'udhay' => 'உதய்', 'udhayan' => 'உதயன்', 'uthaman' => 'உத்தமன்',
            'ulaganathan' => 'உலகநாதன்', 'udhayakumar' => 'உதயகுமார்',
            'umamaheswari' => 'உமாமகேஸ்வரி', 'uma' => 'உமா', 'usha' => 'உஷா',
            'ezhilarasan' => 'எழிலரசன்', 'elango' => 'இளங்கோ', 'ezhilan' => 'எழிலன்',
            'eesan' => 'ஈசன்', 'ezhil' => 'எழில்', 'ezhilarasi' => 'எழிலரசி',
            'eeswari' => 'ஈஸ்வரி', 'elavarasi' => 'இளவரசி', 'oviyan' => 'ஓவியன்', 'oviya' => 'ஓவியா',
            'vasanthan' => 'வசந்தன்', 'valavan' => 'வளவன்', 'vaanavan' => 'வானவன்',
            'varadhan' => 'வரதன்', 'vaithianathan' => 'வைத்தியநாதன்', 'vasanthakumar' => 'வசந்தகுமார்',
            'vallavan' => 'வல்லவன்', 'vasudevan' => 'வாசுதேவன்', 'varadharajan' => 'வரதராஜன்',
            'vallinayagam' => 'வள்ளிநாயகம்', 'vaishnavi' => 'வைஷ்ணவி', 'vasanthi' => 'வசந்தி',
            'valli' => 'வள்ளி', 'vasundhari' => 'வசுந்தரி', 'vaanathi' => 'வானதி',
            'vaijayanthi' => 'வைஜெயந்தி', 'valarmathi' => 'வளர்மதி', 'veeramani' => 'வீரமணி',
            'veeran' => 'வீரன்', 'vignesh' => 'விக்னேஷ்', 'vigneshwaran' => 'விக்னேஸ்வரன்',
            'vijayan' => 'விஜயன்', 'veerapandian' => 'வீரபாண்டியன்', 'vidhya' => 'வித்யா',
            'viswanathan' => 'விஸ்வநாதன்', 'vijayakumar' => 'விஜயகுமார்',
            'senthil' => 'செந்தில்', 'selvan' => 'செல்வன்', 'selvam' => 'செல்வம்',
            'sekaran' => 'சேகரன்', 'sethupathi' => 'சேதுபதி', 'senthilvelan' => 'செந்தில்வேலன்',
            'selvakumar' => 'செல்வகுமார்', 'sekar' => 'சேகர்', 'senthamilan' => 'செந்தமிழன்',
            'sedhuraman' => 'சேதுராமன்', 'seetha' => 'சீதா', 'selvi' => 'செல்வி',
            'selvarani' => 'செல்வராணி', 'seethalakshmi' => 'சீதாலட்சுமி', 'senthamarai' => 'செந்தாமரை',
            'selvarasi' => 'செல்வரசி', 'somasundaram' => 'சோமசுந்தரம்', 'chozhan' => 'சோழன்',
            'somanathan' => 'சோமநாதன்', 'chokkalingam' => 'சொக்கலிங்கம்', 'somasundar' => 'சோமசுந்தர்',
            'solaippan' => 'சோலைப்பன்', 'chozharasan' => 'சோழரசன்', 'sobana' => 'சோபனா',
            'sornambika' => 'சொர்ணாம்பிகா', 'sundaram' => 'சுந்தரம்', 'subramanian' => 'சுப்பிரமணியன்',
            'suriyan' => 'சூரியன்', 'suresh' => 'சுரேஷ்', 'sureshkumar' => 'சுரேஷ்குமார்',
            'sudharshan' => 'சுதர்ஷன்', 'sutharsan' => 'சுதர்சன்', 'suganthan' => 'சுகந்தன்',
            'suganya' => 'சுகன்யா', 'sudha' => 'சுதா', 'sumathi' => 'சுமதி',
            'sundari' => 'சுந்தரி', 'sujatha' => 'சுஜாதா', 'sukirtha' => 'சுகிர்தா',
            'supriya' => 'சுப்ரியா', 'sunitha' => 'சுனிதா', 'suvetha' => 'சுவேதா',
            'subiksha' => 'சுபிக்ஷா', 'lavanyan' => 'லாவண்யன்', 'lakshmanan' => 'லக்ஷ்மணன்',
            'lalithan' => 'லலிதன்', 'lakshminarayanan' => 'லக்ஷ்மிநாராயணன்', 'lakshan' => 'லக்ஷன்',
            'lavanya' => 'லாவண்யா', 'lakshmi' => 'லட்சுமி', 'laxmi' => 'லட்சுமி',
            'lalitha' => 'லலிதா', 'lakshana' => 'லக்ஷணா', 'lakshmipriya' => 'லக்ஷ்மிப்ரியா',
            'lalithambal' => 'லலிதாம்பாள்', 'karthik' => 'கார்த்திக்', 'karthika' => 'கார்த்திகா',
            'karthikeyan' => 'கார்த்திகேயன்', 'kavitha' => 'கவிதா', 'kamal' => 'கமல்',
            'kamalan' => 'கமலன்', 'kavin' => 'கவின்', 'kaviyarasan' => 'கவியரசன்',
            'kannan' => 'கண்ணன்', 'krishnan' => 'கிருஷ்ணன்', 'krishna' => 'கிருஷ்ணா',
            'ganesh' => 'கணேஷ்', 'ganesha' => 'கணேஷா', 'shiva' => 'சிவா',
            'siva' => 'சிவா', 'murugan' => 'முருகன்', 'thirumavalavan' => 'திருமாவளவன்',
            'vishnu' => 'விஷ்ணு', 'vijay' => 'விஜய்', 'vikram' => 'விக்ரம்',
            'vihaan' => 'விஹான்', 'vivaan' => 'விவான்'
        ];
        if (isset($map[$lower])) {
            return $map[$lower];
        }

        static $suffixes = [
            ['moorthy', 'மூர்த்தி'], ['murthy', 'மூர்த்தி'], ['murthi', 'மூர்த்தி'],
            ['nathan', 'நாதன்'], ['rajan', 'ராஜன்'], ['kumar', 'குமார்'],
            ['kumaran', 'குமரன்'], ['swamy', 'சாமி'], ['sami', 'சாமி'],
            ['priya', 'பிரியா'], ['lakshmi', 'லட்சுமி'], ['laxmi', 'லட்சுமி'],
            ['vathi', 'வதி'], ['wathi', 'வதி'], ['rani', 'ராணி'],
            ['devi', 'தேவி'], ['shree', 'ஸ்ரீ'], ['sri', 'ஸ்ரீ'],
            ['velan', 'வேலன்'], ['vel', 'வேல்'], ['ammal', 'அம்மாள்'],
            ['dharan', 'தரன்'], ['sekaran', 'சேகரன்'], ['arasan', 'அரசன்'],
            ['arasu', 'அரசு'], ['mani', 'மணி'], ['valli', 'வள்ளி'],
            ['mathi', 'மதி'], ['selvi', 'செல்வி'], ['selvan', 'செல்வன்'],
            ['chandran', 'சந்திரன்'], ['krishnan', 'கிருஷ்ணன்'], ['raman', 'ராமன்'],
            ['lingam', 'லிங்கம்'], ['pathi', 'பதி']
        ];
        foreach ($suffixes as [$suffix, $rep]) {
            if (str_ends_with($lower, $suffix)) {
                $prefix = substr($lower, 0, -strlen($suffix));
                if ($prefix !== '') {
                    return self::transliterateToTamil($prefix) . $rep;
                }
            }
        }

        static $consonants = [
            ['karth', 'கார்த்த்'], ['krish', 'கிருஷ்'], ['shree', 'ஸ்ரீ'], ['sri', 'ஸ்ரீ'],
            ['sh', 'ஷ'], ['ch', 'ச'], ['th', 'த'], ['dh', 'த'], ['zh', 'ழ'],
            ['ng', 'ங்'], ['ny', 'ஞ்'], ['nj', 'ஞ்'], ['nd', 'ண்ட'], ['nt', 'ந்த'],
            ['mp', 'ம்ப'], ['mb', 'ம்ப'], ['kk', 'க்க'], ['tt', 'ட்ட'], ['pp', 'ப்ப'],
            ['ss', 'ஸ்ஸ'], ['ll', 'ல்ல'], ['nn', 'ன்ன'], ['mm', 'ம்ம'], ['rr', 'ற்ற'],
            ['k', 'க'], ['g', 'க'], ['c', 'ச'], ['s', 'ச'], ['j', 'ஜ'],
            ['t', 'ட'], ['d', 'ட'], ['n', 'ந'], ['p', 'ப'], ['b', 'ப'],
            ['m', 'ம'], ['y', 'ய'], ['r', 'ர'], ['l', 'ல'], ['v', 'வ'],
            ['w', 'வ'], ['h', 'ஹ'], ['z', 'ஜ'], ['x', 'க்ஷ']
        ];

        static $vowelInitial = [
            'aa' => 'ஆ', 'a' => 'அ', 'ee' => 'ஈ', 'ii' => 'ஈ', 'i' => 'இ',
            'oo' => 'ஊ', 'uu' => 'ஊ', 'u' => 'உ', 'ai' => 'ஐ', 'ay' => 'ஐ',
            'ae' => 'ஏ', 'ea' => 'ஏ', 'e' => 'எ', 'oa' => 'ஓ', 'oh' => 'ஓ', 'o' => 'ஒ',
            'au' => 'ஔ', 'ou' => 'ஔ', 'ow' => 'ஔ'
        ];

        static $vowelSigns = [
            'aa' => 'ா', 'a' => '', 'ee' => 'ீ', 'ii' => 'ீ', 'i' => 'ி',
            'oo' => 'ூ', 'uu' => 'ூ', 'u' => 'ு', 'ai' => 'ை', 'ay' => 'ை',
            'ae' => 'ே', 'ea' => 'ே', 'e' => 'ெ', 'oa' => 'ோ', 'oh' => 'ோ', 'o' => 'ொ',
            'au' => 'ௌ', 'ou' => 'ௌ', 'ow' => 'ௌ'
        ];

        static $vowelList = ['aa', 'ai', 'ay', 'au', 'ou', 'ow', 'ee', 'ii', 'oo', 'uu', 'ae', 'ea', 'oa', 'oh', 'a', 'i', 'u', 'e', 'o'];

        $out = '';
        $i = 0;
        $len = strlen($lower);

        foreach ($vowelList as $v) {
            if (str_starts_with($lower, $v)) {
                $out .= $vowelInitial[$v] ?? '';
                $i += strlen($v);
                break;
            }
        }

        while ($i < $len) {
            $cFound = '';
            $cTamil = '';
            $sub = substr($lower, $i);
            foreach ($consonants as [$token, $tam]) {
                if (str_starts_with($sub, $token)) {
                    $cFound = $token;
                    $cTamil = $tam;
                    break;
                }
            }

            if ($cFound !== '') {
                $i += strlen($cFound);
                $vFound = '';
                $vSign = '';
                $subAfter = substr($lower, $i);
                foreach ($vowelList as $v) {
                    if (str_starts_with($subAfter, $v)) {
                        $vFound = $v;
                        $vSign = $vowelSigns[$v] ?? '';
                        break;
                    }
                }

                if ($cFound === 'n' && $i >= $len) {
                    $out .= 'ன்';
                } elseif ($cFound === 'm' && $i >= $len) {
                    $out .= 'ம்';
                } elseif ($cFound === 'r' && $i >= $len) {
                    $out .= 'ர்';
                } elseif ($cFound === 'l' && $i >= $len) {
                    $out .= 'ல்';
                } elseif ($cFound === 's' && $i >= $len) {
                    $out .= 'ஸ்';
                } elseif ($cFound === 'sh' && $i >= $len) {
                    $out .= 'ஷ்';
                } elseif ($cFound === 'th' && $i >= $len) {
                    $out .= 'த்';
                } elseif ($cFound === 'k' && $i >= $len) {
                    $out .= 'க்';
                } elseif ($vFound === '') {
                    if (str_ends_with($cTamil, '்')) {
                        $out .= $cTamil;
                    } else {
                        $out .= $cTamil . '்';
                    }
                } else {
                    $i += strlen($vFound);
                    if (str_ends_with($cTamil, '்')) {
                        $out .= mb_substr($cTamil, 0, -1, 'UTF-8') . $vSign;
                    } else {
                        $out .= $cTamil . $vSign;
                    }
                }
            } else {
                $ch = $lower[$i];
                if (isset($vowelInitial[$ch])) {
                    $out .= $vowelInitial[$ch];
                } else {
                    $out .= $ch;
                }
                $i++;
            }
        }

        return $out !== '' ? $out : $trimmed;
    }

    public static function transliterateToHindi(string $name): string {
        $trimmed = trim($name);
        $lower = strtolower(preg_replace('/[^a-zA-Z]/', '', $trimmed));
        if ($lower === '') return $trimmed;

        static $map = [
            'rudhran' => 'रुद्रन', 'rudra' => 'रुद्र', 'rudramoorthy' => 'रुद्रमूर्ति',
            'rupan' => 'रूपन', 'rukesh' => 'रुकेश', 'raman' => 'रामन', 'rama' => 'राम', 'ram' => 'राम',
            'ravichandran' => 'रविचंद्रन', 'ramachandran' => 'रामचंद्रन',
            'rithik' => 'ऋतिक', 'rethinavel' => 'रत्नवेल', 'rethik' => 'रेतिक',
            'renjith' => 'रंजीत', 'revanth' => 'रेवंत', 'rajan' => 'राजन',
            'ramakrishnan' => 'रामकृष्णन', 'rajarajan' => 'राजराजन',
            'rithish' => 'रितीश', 'rohan' => 'रोहन', 'rohit' => 'रोहित',
            'rohith' => 'रोहित', 'roshan' => 'रोशन', 'rohinthan' => 'रोहिंतन',
            'raghav' => 'राघव', 'raghavan' => 'राघवन', 'rajendran' => 'राजेंद्रन',
            'raam' => 'राम', 'rishikesan' => 'ऋषिकेश', 'rishikesh' => 'ऋषिकेश',
            'rishi' => 'ऋषि', 'reyansh' => 'रेयांश', 'revansh' => 'रेवांश',
            'rahul' => 'राहुल', 'ravi' => 'रवि', 'ritvik' => 'ऋत्विक',
            'ridhaan' => 'रिधान', 'ritul' => 'रितुल', 'ranveer' => 'रणवीर',
            'rishabh' => 'ऋषभ', 'tharun' => 'तरुण', 'tarun' => 'तरुण',
            'thangaraj' => 'तंगराज', 'thangavel' => 'तंगवेल', 'thamizharasan' => 'तमिळरसन',
            'dhanasekaran' => 'धनशेखरन', 'dharanidharan' => 'धरणीधरन',
            'thavamani' => 'तवमणि', 'thamodaran' => 'दामोदरन', 'thayumanavan' => 'तायुमानवन',
            'dhanush' => 'धनुष', 'dheeraj' => 'धीरज', 'dhiraj' => 'धीरज',
            'danish' => 'दानिश', 'dheeman' => 'धीमान', 'dhir' => 'धीर',
            'theerth' => 'तीर्थ', 'aarav' => 'आरव', 'aditya' => 'आदित्य',
            'ananya' => 'अनन्या', 'anushka' => 'अनुष्का', 'akshay' => 'अक्षय',
            'arjun' => 'अर्जुन', 'abhay' => 'अभय', 'arnav' => 'अर्णव',
            'anirudh' => 'अनिरुद्ध', 'aryan' => 'आर्यन', 'advait' => 'अद्वैत',
            'akhil' => 'अखिल', 'ansh' => 'अंश', 'amit' => 'अमित',
            'aanya' => 'आन्या', 'aaradhya' => 'आराध्या', 'aditi' => 'अदिति',
            'akshara' => 'अक्षरा', 'anika' => 'अनिका', 'aadya' => 'आद्या',
            'avni' => 'अवनी', 'amrita' => 'अमृता', 'aisha' => 'आयशा',
            'karthik' => 'कार्तिक', 'karthika' => 'कार्तिका', 'karthikeyan' => 'कार्तिकेयन',
            'lakshmi' => 'लक्ष्मी', 'laxmi' => 'लक्ष्मी', 'vishnu' => 'विष्णु',
            'ganesh' => 'गणेश', 'shiva' => 'शिव', 'suresh' => 'सुरेश',
            'senthil' => 'सेंथिल', 'selvan' => 'सेल्वन', 'vijay' => 'विजय',
            'vikram' => 'विक्रम', 'vihaan' => 'विहान', 'vivaan' => 'विवान',
            'lavanya' => 'लावण्या'
        ];
        if (isset($map[$lower])) {
            return $map[$lower];
        }

        static $consonantsHi = [
            ['karth', 'कार्थ'], ['krish', 'कृष'], ['shree', 'श्री'], ['sri', 'श्री'],
            ['ksh', 'क्ष'], ['gy', 'ज्ञ'], ['tr', 'त्र'], ['chh', 'छ'], ['ch', 'च'],
            ['shh', 'ष'], ['sh', 'श'], ['th', 'थ'], ['dh', 'ध'], ['kh', 'ख'],
            ['gh', 'घ'], ['jh', 'झ'], ['bh', 'भ'], ['ph', 'फ'], ['ng', 'ं'],
            ['k', 'क'], ['g', 'ग'], ['c', 'च'], ['s', 'स'], ['j', 'ज'],
            ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'], ['b', 'ब'],
            ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'],
            ['w', 'व'], ['h', 'ह'], ['z', 'ज़'], ['f', 'फ़']
        ];

        static $vowelInitialHi = [
            'aa' => 'आ', 'a' => 'अ', 'ee' => 'ई', 'ii' => 'ई', 'i' => 'इ',
            'oo' => 'ऊ', 'uu' => 'ऊ', 'u' => 'उ', 'ai' => 'ऐ', 'ay' => 'ऐ',
            'ae' => 'ए', 'ea' => 'ए', 'e' => 'ए', 'oa' => 'ओ', 'oh' => 'ओ', 'o' => 'ओ',
            'au' => 'औ', 'ou' => 'औ', 'ow' => 'औ', 'ri' => 'ऋ'
        ];

        static $vowelSignsHi = [
            'aa' => 'ा', 'a' => '', 'ee' => 'ी', 'ii' => 'ी', 'i' => 'ि',
            'oo' => 'ू', 'uu' => 'ू', 'u' => 'ु', 'ai' => 'ै', 'ay' => 'ै',
            'ae' => 'े', 'ea' => 'े', 'e' => 'े', 'oa' => 'ो', 'oh' => 'ो', 'o' => 'ो',
            'au' => 'ौ', 'ou' => 'ौ', 'ow' => 'ौ', 'ri' => 'ृ'
        ];

        static $vowelListHi = ['aa', 'ai', 'ay', 'au', 'ou', 'ow', 'ee', 'ii', 'oo', 'uu', 'ae', 'ea', 'oa', 'oh', 'ri', 'a', 'i', 'u', 'e', 'o'];

        $out = '';
        $i = 0;
        $len = strlen($lower);

        foreach ($vowelListHi as $v) {
            if (str_starts_with($lower, $v)) {
                $out .= $vowelInitialHi[$v] ?? '';
                $i += strlen($v);
                break;
            }
        }

        while ($i < $len) {
            $cFound = '';
            $cHi = '';
            $sub = substr($lower, $i);
            foreach ($consonantsHi as [$token, $dev]) {
                if (str_starts_with($sub, $token)) {
                    $cFound = $token;
                    $cHi = $dev;
                    break;
                }
            }

            if ($cFound !== '') {
                $i += strlen($cFound);
                $vFound = '';
                $vSign = '';
                $subAfter = substr($lower, $i);
                foreach ($vowelListHi as $v) {
                    if (str_starts_with($subAfter, $v)) {
                        $vFound = $v;
                        $vSign = $vowelSignsHi[$v] ?? '';
                        break;
                    }
                }

                if ($vFound === '') {
                    if ($i >= $len) {
                        $out .= $cHi;
                    } else {
                        $out .= $cHi . '्';
                    }
                } else {
                    $i += strlen($vFound);
                    $out .= $cHi . $vSign;
                }
            } else {
                $ch = $lower[$i];
                if (isset($vowelInitialHi[$ch])) {
                    $out .= $vowelInitialHi[$ch];
                } else {
                    $out .= $ch;
                }
                $i++;
            }
        }

        return $out !== '' ? $out : $trimmed;
    }

    /**
     * Master single-source dispatcher: returns the exact HTML for any service type
     */
    public static function renderFullReportHtml($order, $result): string {
        $serviceType = $order['service_type'] ?? $order['serviceType'] ?? 'BIRTH_JATHAGAM';
        if ($serviceType === 'MARRIAGE_COMPATIBILITY') {
            return self::generateWeddingMatchingHtml($order, $result);
        } elseif ($serviceType === 'BABY_NAMING') {
            return self::generateBabyNamingHtml($order, $result);
        } elseif ($serviceType === 'MUHURTHAM') {
            return self::generateMuhurthamHtml($order, $result);
        } else {
            return self::generateBirthJathagamHtml($order, $result);
        }
    }

    /** Shared CSS matching the browser preview design */
    public static function sharedCss($lang): string {
        $fontFam = ($lang === 'ta')
            ? 'notosanstamil, nototamil, balootamil, notosans, sans-serif'
            : (($lang === 'hi')
                ? 'notosansdevanagari, notodevanagari, yatraone, notosans, sans-serif'
                : 'notosans, cinzel, sans-serif');

        return <<<CSS
    @page { margin: 6mm 8mm 10mm; }
    body { font-family: {$fontFam}; color: #2b1d14; font-size: 9.5px; line-height: 1.35; background: #fffdf9; margin: 0; padding: 0; }
    
    .report-page-break { page-break-after: always; }
    .report-card, .rasi-chart-table, .dosha-section, .dosha-card, .life-card, .panel, .sheet, table, table.rasi-table, table.details-grid, table.data-table, table.life-grid { page-break-inside: avoid; }

    .sheet { background: #fdfaf6; border: 1.5px solid #c9962c; border-radius: 4px; padding: 6mm 7mm 7mm; position: relative; margin-bottom: 2mm; box-sizing: border-box; }

    .header-lockup { width: 100%; text-align: center; page-break-inside: avoid; margin: 0; }
    .header-logo { width: 58px; height: 58px; max-width: 58px; max-height: 58px; display: block; margin: 0 auto 1mm; object-fit: contain; image-rendering: -webkit-optimize-contrast; }
    .header-brand { font-size: 16px; font-weight: bold; color: #7d1233; letter-spacing: 0.5px; text-align: center; line-height: 1.2; }
    .header-sub { font-size: 10.5px; color: #0b7a5a; font-weight: bold; margin-top: 0.5mm; text-align: center; }
    .header-contact { font-size: 8.5px; color: #64748b; margin-top: 0.5mm; text-align: center; font-weight: bold; }
    .header-extra { font-size: 8px; color: #64748b; margin-top: 0.4mm; text-align: center; font-weight: bold; }
    /* The reference line is a three-cell row: the prepared-date stamp rides
       on the LEFT (first page only), the page tag + order reference stay
       centred. Fixed equal side cells keep the centre block centred whatever
       the stamp's length. */
    .header-reference { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 0.6mm; }
    .header-reference td { font-size: 7.5px; color: #64748b; font-weight: bold; padding: 0; vertical-align: middle; }
    .header-reference .ref-side { width: 32%; }
    .header-reference .ref-left { text-align: left; }
    .header-reference .ref-center { text-align: center; }
    .header-page-tag { color: #7d1233; font-weight: bold; }
    .header-order-ref { margin-left: 2mm; color: #64748b; }
    .header-prepared { color: #7d1233; font-weight: bold; white-space: nowrap; }
    table.modern-divider { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 1.2mm 0 3mm; }
    table.modern-divider td { height: 0.6mm; padding: 0; border: 0; }

    .panel { background: #fffdf7; border: 1.2px solid #c9962c; border-radius: 4px; padding: 2.5mm 3.5mm; margin-bottom: 2.5mm; }
    .panel-title { font-size: 10.5px; font-weight: bold; color: #7a1f1f; border-bottom: 1px dotted #a67c1f; padding-bottom: 1mm; margin-bottom: 2mm; }

    /* Page 2 - Marriage Matching disclaimer (shared localized copy).
       Sized so the panel fills the whole sheet instead of leaving half a page
       blank: generous type, a centred reading column and even paragraph gaps. */
    .disclaimer-panel { background: #fffdf7; padding: 4mm 5mm; }
    .disclaimer-title { font-size: 13px; font-weight: bold; color: #7a1f1f; text-align: center; border-bottom: 1px dotted #a67c1f; padding-bottom: 2mm; }
    .disclaimer-heading { font-size: 11.5px; font-weight: bold; color: #2d5a3d; text-align: center; margin: 2mm 0 2.5mm; }
    .disclaimer-para { font-size: 11px; line-height: 1.9; color: #2b1d14; margin: 0 0 4mm; text-align: left; overflow-wrap: anywhere; }
    .disclaimer-para:last-child { margin-bottom: 0; }
    .disclaimer-para strong { color: #7a1f1f; font-weight: bold; }

    /* Page 2 - attestation / signature block */
    .attestation { border: 1px solid #e8d9b8; border-top: 3px solid #7a1f1f; border-radius: 4px; background: #fffdf7; padding: 4mm 5mm; margin-top: 2.5mm; }
    .attestation-title { font-size: 12px; font-weight: bold; color: #7a1f1f; letter-spacing: 0.8px; text-align: center; text-transform: uppercase; border-bottom: 1px dotted #a67c1f; padding-bottom: 2mm; }
    .attestation-grid { width: 100%; border-collapse: collapse; margin-top: 3mm; }
    .attestation-grid td { vertical-align: top; padding: 0; }
    .attest-item { margin-bottom: 2.5mm; }
    .attest-lbl { color: #a67c1f; font-weight: bold; font-size: 8.5px; display: block; margin-bottom: 0.5mm; }
    .attest-val { color: #2b1d14; font-weight: bold; font-size: 10.5px; }
    .attestation-sign { text-align: left; padding-left: 4mm !important; border-left: 1px dashed #e8d9b8; }
    .signature-rule { border-bottom: 1px solid #7a1f1f; height: 6mm; }
    .signatory-label { font-size: 9.5px; font-weight: bold; color: #2b1d14; }
    .signatory-desk { font-size: 9px; font-weight: bold; color: #a67c1f; margin-top: 0.5mm; }

    table.details-grid { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.details-grid td { padding: 1mm 2mm; vertical-align: top; width: 50%; }
    .det-box { background: #fdf8ee; border: 1px solid #e8d9b8; border-radius: 3px; padding: 1mm 2.2mm; }
    .det-lbl { color: #a67c1f; font-weight: bold; font-size: 8px; display: block; margin-bottom: 0.2mm; }
    .det-val { color: #2b1d14; font-weight: bold; font-size: 9.5px; }

    /* South Indian Rasi Chart 4x4 Grid */
    table.rasi-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.rasi-table tr { height: 11.5mm; }
    table.rasi-table td { border: 1.2px solid #a67c1f; vertical-align: top; text-align: center; height: 11.5mm; max-height: 11.5mm; padding: 0.7mm; background: #fffdf7; width: 25%; min-width: 25%; max-width: 25%; overflow: hidden; box-sizing: border-box; }
    .rasi-sign-title { font-size: 7px; color: #6a4c28; font-weight: bold; border-bottom: 0.5px dotted #c9962c; padding-bottom: 0.3mm; margin-bottom: 0.5mm; display: block; line-height: 1.15; }
    .rasi-planets { font-size: 7.5px; color: #1e293b; font-weight: bold; line-height: 1.15; margin-top: 0.3mm; }
    .planet-name { color: #1e293b; font-size: 7.5px; font-weight: bold; display: inline-block; margin: 0.2mm 0.5mm; background: none; border: none; padding: 0; }
    .planet-name.lagna { color: #dc2626; font-size: 8px; font-weight: 900; background: none; border: none; padding: 0; }
    .chart-legend { display: block; margin: 1.4mm 0 0; padding: 1.4mm 2mm; border: 1px solid #e2e8f0; border-left: 2px solid #c9a227; border-radius: 3px; background: #fffdf7; font-size: 7.6px; line-height: 1.3; color: #475569; }
    .chart-legend-title { font-size: 8.2px; font-weight: 800; color: #7b1e3b; letter-spacing: 0.3px; margin-right: 2mm; }
    .chart-legend-item { display: inline-block; margin: 0 2.2mm 0.4mm 0; }
    .chart-legend-item b { color: #7b1e3b; font-weight: 900; }
    .chart-legend-note { display: block; color: #64748b; font-size: 7.2px; margin-top: 0.6mm; }
    .rasi-center-om { background: #fdf8ee; color: #7a1f1f; font-size: 12px; font-weight: bold; vertical-align: middle; text-align: center; height: 23mm !important; }
    .rasi-center-om span { font-size: 7px; color: #a67c1f; }

    .mini-note { font-size: 7px; color: #6b5b4a; line-height: 1.2; margin: 0.3mm 0 0; }

    table.data-table { width: 100%; border-collapse: collapse; font-size: 8.5px; margin-bottom: 2mm; }
    table.data-table th { background: #7a1f1f; color: #ffffff; font-size: 8.5px; font-weight: bold; padding: 1.5mm 2mm; text-align: left; }
    table.data-table td { padding: 1.2mm 2mm; border-bottom: 1px dotted #e8d9b8; vertical-align: top; }
    table.data-table tr:nth-child(even) td { background: #fdfaf5; }
    /* Marriage Compatibility: the 10 Poruthams table is the body of page 1, so
       its rows are spaced to carry the sheet down to the footer instead of
       leaving the lower half of the page blank. */
    table.wedding-poruthams td { padding: 3mm 2.5mm; vertical-align: middle; }
    table.wedding-poruthams th { padding: 2mm 2.5mm; }

    /* Two dosha cards per row: the same cards, half the vertical space. */
    table.dosha-pair-grid { width: 100%; border-collapse: separate; border-spacing: 2mm 0; table-layout: fixed; }
    table.dosha-pair-grid td.dosha-cell { width: 50%; vertical-align: top; padding: 0; }
    table.dosha-pair-grid .dosha-card { margin-bottom: 1.6mm; }
    .dosha-card { border-left: 4px solid #7a1f1f; background: #fffdf7; border-top: 1.2px solid #c9962c; border-right: 1.2px solid #c9962c; border-bottom: 1.2px solid #c9962c; border-radius: 4px; padding: 1.6mm 3mm; margin-bottom: 1.6mm; }
    .dosha-badge { font-size: 8px; font-weight: bold; padding: 0.5mm 2mm; border-radius: 3px; display: inline-block; }
    .badge-clean { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-moderate { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
    .badge-afflicted { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .badge-cancelled { background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .rule-note { font-size: 6.4px; color: #475569; margin-top: 0.4mm; line-height: 1.22; }
    .planet-dignity { font-size: 6.8px; color: #334155; }
    .dosha-desc { font-size: 8.5px; color: #2b1d14; line-height: 1.4; margin-top: 0.6mm; }

    /* Report Guide & Glossary sheet — the last page of every report.
       Two side-by-side columns because a print renderer has no CSS columns. */
    .glossary-sheet { padding: 5.5mm 7mm 5.5mm; }
    .glossary-quick { border: 1px solid #e2e8f0; border-left: 3px solid #c9962c; background: #fffdf7; border-radius: 4px; padding: 1.6mm 2.6mm 1.4mm; margin: 1.6mm 0 2mm; page-break-inside: avoid; }
    .glossary-quick-title { font-size: 10px; font-weight: bold; color: #7a1230; margin-bottom: 1mm; }
    .glossary-quick-row { font-size: 9.5px; line-height: 1.32; color: #2b1d14; margin: 0 0 0.7mm; }
    .glossary-quick-row b { color: #7a1230; }
    .glossary-quick-more { font-size: 8.5px; line-height: 1.3; color: #64748b; border-top: 0.6px dotted #c9962c; padding-top: 0.8mm; margin-top: 0.6mm; }
    .glossary-title { font-size: 14px; font-weight: bold; color: #7a1230; margin-bottom: 1mm; }
    .glossary-intro { font-size: 10px; color: #2b1d14; line-height: 1.4; margin-bottom: 2.5mm; }
    table.glossary-columns { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.glossary-columns td.glossary-col { width: 50%; vertical-align: top; padding: 0 3mm 0 0; }
    table.glossary-columns td.glossary-col:last-child { padding: 0 0 0 3mm; border-left: 0.6px dotted #c9962c; }
    .glossary-item { margin-bottom: 2.2mm; page-break-inside: avoid; }
    .glossary-term { font-size: 10.5px; font-weight: bold; color: #7a1230; line-height: 1.25; }
    .glossary-meaning { font-size: 9.5px; color: #2b1d14; line-height: 1.38; }
    .glossary-note { font-size: 9.5px; color: #64748b; line-height: 1.38; border-top: 0.6px dotted #c9962c; padding-top: 1.6mm; margin-top: 2mm; }

    /* Page 2 Life Cards Grid.
       Item 7: every card is sized to its own content. A table row grows to its
       tallest cell, so no row height is ever forced here — that is the PHP
       equivalent of the browser report's `grid-auto-rows: auto` + content-sized
       fitter. Shorter cards simply end early instead of being stretched. */
    table.life-grid { width: 100%; border-collapse: separate; border-spacing: 2.5mm; margin-bottom: 2mm; }
    table.life-grid td.life-card p { margin-top: 1mm; }
    .life-disclaimer { font-size: 7.5px; line-height: 1.25; color: #6b5b4a; text-align: center; margin: 0 0 1.5mm; overflow-wrap: anywhere; }
    table.life-grid td.life-card { width: 47%; background: #fffdf7; border: 1.2px solid #c9962c; border-radius: 4px; padding: 2.5mm 3.2mm; vertical-align: top; min-width: 0; }
    .life-card-badge { font-size: 9.5px; font-weight: bold; background: #fdf3e0; color: #a67c1f; border: 1px solid #e8d9b8; border-radius: 3px; padding: 0.4mm 1.6mm; display: inline-block; max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: right; line-height: 1.2; }
    .life-card-badge.badge-caution { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .life-card p { font-size: 11.5px; color: #2b1d14; line-height: 1.4; margin: 1mm 0 0; overflow-wrap: anywhere; }

    .closing-quote { font-style: italic; font-size: 8.5px; line-height: 1.3; color: #2d5a3d; text-align: center; font-weight: bold; margin: 1.2mm 0; }
    .navagraha-intro { font-size: 8.5px; line-height: 1.35; margin: 0 0 2mm; }
    .navagraha-section-title { color: #7a1f1f; font-size: 9.5px; font-weight: bold; border-bottom: 1px dotted #a67c1f; padding-bottom: 1mm; margin: 1mm 0 1.5mm; }
    .navagraha-reason { font-size: 8.5px; line-height: 1.35; margin: 0 0 1.2mm; }
    .navagraha-reason strong { color: #7a1f1f; }

    /* Page 3 second half: complete Navagraha reference for all nine grahas.
       Only universal actions are listed (prayer focus, weekday, colour,
       charity, conduct) - no ritual recitation and no temple pilgrimage -
       because most Astro Sivam users live outside India. */
    .navagraha-note { font-size: 7.8px; line-height: 1.25; color: #6b5b4a; margin: 0 0 0.8mm; overflow-wrap: anywhere; }
    .navagraha-intro { font-size: 8px; line-height: 1.25; color: #2b1d14; margin: 0 0 0.8mm; overflow-wrap: anywhere; }
    .navagraha-subsection { color: #2d5a3d; font-size: 9px; font-weight: bold; margin: 1mm 0 0.5mm; }
    ul.navagraha-list { list-style: none; margin: 0 0 1.2mm; padding: 0; }
    ul.navagraha-list li { font-size: 8px; line-height: 1.28; color: #2b1d14; padding-left: 3.5mm; position: relative; margin-bottom: 0.6mm; overflow-wrap: anywhere; }
    ul.navagraha-list li::marker { content: ""; }
    ul.navagraha-list li strong { color: #7a1f1f; }
    .navagraha-closing { font-style: italic; font-size: 8px; line-height: 1.3; color: #2d5a3d; font-weight: bold; text-align: center; margin: 0.8mm 0 0; }
    /* Item 7: the Navagraha table is the reference table of the remedies page,
       so it is set at the same 10px floor as the browser HTML report instead of
       the old 7.4px/6.8px that was unreadable once printed. */
    table.navagraha-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 1.5mm; }
    table.navagraha-table th { background: #7a1f1f; color: #ffffff; font-size: 10px; font-weight: bold; padding: 0.4mm 1mm; text-align: left; border: 1px solid #7a1f1f; line-height: 1.12; }
    /* 10px type with tighter cell padding and line spacing keeps the nine-row
       reference table at the height the old 7.4px table used to occupy. */
    table.navagraha-table td { padding: 0.25mm 1mm; border: 1px solid #e8d9b8; vertical-align: top; line-height: 1.12; color: #2b1d14; overflow-wrap: anywhere; }
    table.navagraha-table tr.even td { background: #fdfaf5; }
    table.navagraha-table td:first-child { color: #7a1f1f; font-weight: bold; }
    table.navagraha-table td.col-day { font-weight: bold; }
    table.navagraha-table tr.is-flagged td { background: #fef3c7; font-weight: bold; }

    .footer { text-align: center; border-top: 1.2px solid #c9962c; padding-top: 1.5mm; font-size: 8px; color: #a67c1f; margin-top: 2mm; }
    .footer .brand { color: #7a1f1f; font-weight: bold; font-size: 8.5px; }
CSS;
    }

    /**
     * prepared-date stamp for a report. The date is the one stored in the
     * calculation result (generatedAt) — for a stored snapshot that is the
     * original order-date time, so a preview never looks freshly prepared.
     * Empty when the result carries no date (no stamp rather than a wrong
     * "today" stamp).
     *
     * Display rule (owner request, Oct 2026): every report prints the stamp
     * on its FIRST page only, on the LEFT of the header/footer reference
     * line — never centred with the page numbers.
     */
    /**
     * The prepared-date stamp: the bare date, in every language. It carried a
     * English / Tamil / Hindi label until the owner asked (2026-10-21) for
     * the date alone inside reports. One method, because the four report headers
     * and the frozen-snapshot parity test all print exactly this string.
     */
    public static function preparedDateStamp($result, string $lang): string {
        $raw = is_array($result) ? trim((string) ($result['generatedAt'] ?? '')) : '';
        if ($raw === '') return '';
        $ts = strtotime($raw);
        if ($ts === false) return '';
        return date('d M Y', $ts);
    }

    public static function topHeader(string $title, string $subtitle, string $orderNumber, int $page, int $total, string $lang, string $meta = '', bool $slashPageLabel = false, string $preparedLabel = ''): string {
        // $slashPageLabel: the Birth Jathagam states "Page x / 3" (the form the
        // change request asks for). The other reports keep their existing
        // "Page x of y" wording, so this stays opt-in.
        // $preparedLabel is passed by the callers' page-1 header only (the
        // stamp never repeats on later pages) and prints on the LEFT of the
        // reference line, opposite the centred page/order tags.
        $brandText = trim($title) === 'ASTRO SIVAM' ? 'ASTRO SIVAM - OFFICIAL VEDIC REPORT' : $title;
        $brand = self::e($brandText);
        $s = self::e($subtitle);
        $o = self::e($orderNumber);
        $pageStr = ($lang === 'ta') ? "பக்கம் {$page} / {$total}" : (($lang === 'hi') ? "पृष्ठ {$page} / {$total}" : ($slashPageLabel ? "Page {$page} / {$total}" : "Page {$page} of {$total}"));
        $metaHtml = trim($meta) !== '' ? '<div class="header-extra">' . self::e($meta) . '</div>' : '';
        $orderHtml = trim($orderNumber) !== '' ? '<span class="header-order-ref">#' . $o . '</span>' : '';
        // The prepared-date stamp (first page only) rides on the LEFT of the
        // reference line — never centred with the page tag (owner request,
        // Oct 2026). Absolutely positioned in the browser builders; a fixed
        // side cell here, so fixed-height report pages do not move.
        $preparedHtml = trim($preparedLabel) !== '' ? '<span class="header-prepared">' . self::e($preparedLabel) . '</span>' : '';

        // Root-relative URL on purpose: this same HTML string is served to a
        // browser by the admin "preview HTML" route, so a raw server path could
        // never be loaded.
        $logoSrc = astro_logo_url();
        $logoTag = '<img src="' . $logoSrc . '" class="header-logo" alt="ASTRO SIVAM" />';

        return <<<HTML
<div class="header-lockup">
  {$logoTag}
  <div class="header-brand">{$brand}</div>
  <div class="header-sub">{$s}</div>
  <div class="header-contact">astrosivam.com &bull; admin@astrosivam.com</div>
  {$metaHtml}
  <table class="header-reference"><tr>
    <td class="ref-side ref-left">{$preparedHtml}</td>
    <td class="ref-center"><span class="header-page-tag">{$pageStr}</span>{$orderHtml}</td>
    <td class="ref-side"></td>
  </tr></table>
</div>
<table class="modern-divider"><tr>
  <td style="width:17%;background:#edd1d9;"></td><td style="width:16%;background:#cf8e9f;"></td>
  <td style="width:15%;background:#7d1233;"></td><td style="width:4%;background:#a85a14;"></td>
  <td style="width:15%;background:#7d1233;"></td><td style="width:16%;background:#cf8e9f;"></td>
  <td style="width:17%;background:#edd1d9;"></td>
</tr></table>
HTML;
    }

    public static function footerBand(string $lang): string {
        $msg = ($lang === 'ta')
            ? 'ஆஸ்ட்ரோ சிவம் பாரம்பரிய வேத கணிப்பகம் &bull; சமஸ்கிருத வேத வித்வான்களால் சான்றளிக்கப்பட்டது &bull; astrosivam.com'
            : (($lang === 'hi')
                ? 'एस्ट्रो शिवम वैदिक पंचांग एवं ज्योतिष संस्थान &bull; संस्कृत विद्वानों द्वारा प्रमाणित &bull; astrosivam.com'
                : 'ASTRO SIVAM Precision Vedic Ephemeris &bull; Certified by Sanskrit Scholars Board &bull; astrosivam.com');

        return <<<HTML
<div class="footer">
  <span class="brand">ASTRO SIVAM</span> &bull; {$msg}
</div>
HTML;
    }

}
