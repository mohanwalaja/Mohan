# ASTRO SIVAM — Verified Astrology Source Registry

`sources.json` is the authoritative machine-readable registry (mirrored identically at `api/knowledge/ai-astrologer/sources.json`). Every entry registered in `sources.json` (**39 sources total: 31 Tamil + 8 foundational English/Sanskrit calculation & structural works**) is actively cited by the deterministic local chat engine or ephemeris layer.

- **Zero Hindi book sources (`HI-*` removed completely).**
- **Zero external LLM API calls.**
- **Zero dead URLs, unopened third-party PDF links, or undecoded scraper stubs.**

---

## 1. தமிழ் மூல நூல்கள் (Classical Tamil Jyotisha Works — 19 Works)

| ID | நூல் (Tamil Title) | English Title | Verification |
| :--- | :--- | :--- | :--- |
| `TA-01` | பிருகத் ஜாதகம் | *Brihat Jataka* (Tamil commentary edition) | `metadata-verified` |
| `TA-02` | ஜாதக அலங்காரம் | *Jataka Alankaram* — Keeranur Natarajar | `content-read` |
| `TA-03` | குமாரசுவாமீயம் | *Kumaraswamiyam* | `metadata-verified` |
| `TA-04` | சராவளி | *Saravali* (Tamil edition) | `metadata-verified` |
| `TA-05` | பலதீபிகை | *Phaladeepika* (Tamil edition) | `metadata-verified` |
| `TA-06` | காலப் பிரகாசிகை | *Kala Prakasikai* | `metadata-verified` |
| `TA-07` | அபிதான சிந்தாமணி | *Abithana Chintamani* — A. Singaravelu Mudaliar | `content-read` |
| `TA-08` | நவக்கிரக ஆராதனை | *Navagraha Aradhanai* | `metadata-verified` |
| `TA-10` | ஜாதக பாரிஜாதம் | *Jataka Parijatham* (Tamil edition) | `metadata-verified` |
| `TA-11` | ஜாதக சிந்தாமணி | *Jataka Chintamani* | `metadata-verified` |
| `TA-12` | சோதிட சிந்தாமணி | *Sothida Chintamani* | `metadata-verified` |
| `TA-13` | வீமேசுவர உள்ளமுடையான் | *Veemeswara Ullamudaiyan* | `metadata-verified` |
| `TA-14` | பஞ்ச பட்சி சாஸ்திரம் | *Pancha Pakshi Sastram* | `metadata-verified` |
| `TA-15` | சினேந்திரமாலை | *Jinendramalai* | `metadata-verified` |
| `TA-16` | வராகி மாலை | *Varahi Malai* | `metadata-verified` |
| `TA-18` | திருமணப் பொருத்தம் | *Thirumana Porutham* (10 Porutham tradition) | `metadata-verified` |
| `TA-19` | பெயர் வைக்கும் முறை (நாமகரணம்) | *Nakshatra Pada Namakaranam Tradition* | `metadata-verified` |
| `TA-24` | வாக்கிய / திருக்கணித பஞ்சாங்க மரபு | *Tamil Panchangam Tradition* | `metadata-verified` |
| `TA-25` | திருக்குறள் (ஊழ் அதிகாரம்) | *Tirukkural* — Chapter 38 (*Uzh*) | `content-read` |

---

## 2. தமிழக நவக்கிரக மற்றும் முருகன் தலங்கள் (Tamil Nadu Navagraha & Murugan Sthalams — 11 Records)

| ID | திருத்தலம் | Graha / Tradition | Verification |
| :--- | :--- | :--- | :--- |
| `TP-01` | சுவாமிமலை சுவாமிநாதசுவாமி கோயில் | Murugan (Arupadai Veedu) | `content-read` |
| `TP-02` | பழனி தண்டாயுதபாணி சுவாமி கோயில் | Murugan / Sevvai Adhidevata | `content-read` |
| `TP-03` | திருநள்ளாறு தர்பாரண்யேஸ்வரர் கோயில் | சனி (Sani Sthalam) | `content-read` |
| `TP-04` | வைத்தீஸ்வரன் கோயில் வைத்தியநாதசுவாமி | செவ்வாய் (Angaraka / Sevvai Sthalam) | `metadata-verified` |
| `TP-05` | திருவெண்காடு சுவேதாரண்யேஸ்வரர் கோயில் | புதன் (Budha Sthalam) | `metadata-verified` |
| `TP-06` | ஆலங்குடி ஆபத்சகாயேஸ்வரர் கோயில் | குரு (Guru Sthalam) | `metadata-verified` |
| `TP-07` | கஞ்சனூர் அக்னீஸ்வரர் கோயில் | சுக்கிரன் (Sukra Sthalam) | `metadata-verified` |
| `TP-08` | திருநாகேஸ்வரம் நாகநாதசுவாமி கோயில் | ராகு (Rahu Sthalam) | `metadata-verified` |
| `TP-10` | சூரியனார் கோயில் சிவசூரியநாராயணர் | சூரியன் (Surya Sthalam) | `metadata-verified` |
| `TP-11` | திங்களூர் கைலாசநாதர் கோயில் | சந்திரன் (Chandra Sthalam) | `metadata-verified` |
| `TP-12` | கீழ்ப்பெரும்பள்ளம் நாகநாதசுவாமி கோயில் | கேது (Ketu Sthalam) | `metadata-verified` |

---

## 3. Astronomical & Classical Structural References (9 Works)

| ID | Title | Author / Body | Verification |
| :--- | :--- | :--- | :--- |
| `EN-01` | *Brihat Jataka* (English translation) | Varahamihira (tr. N. Chidambaram Iyer, 1885) | `content-read` |
| `EN-02` | *Phaladeepika* | Mantreswara (tr. V. Subrahmanya Sastri, 1937) | `content-read` |
| `EN-04` | *Brihat Parashara Hora Shastra* | Maharshi Parashara | `metadata-verified` |
| `EN-06` | *Jataka Parijata* | Vaidyanatha Dikshita | `metadata-verified` |
| `EN-07` | *Sarvartha Chintamani* | Venkatesa Daivagna | `metadata-verified` |
| `EN-09` | *Muhurtha* (Electional Astrology) | B. V. Raman | `catalogue-verified` |
| `REF-01` | *Rashtriya Panchang* (Tamil / Positional Astronomy benchmark) | Positional Astronomy Centre, Govt. of India | `content-read` |
| `REF-02` | *Surya Siddhanta* (tr. Ebenezer Burgess, 1860) | Public-domain astronomical treatise | `content-read` |
| `REF-03` | *Report of the Calendar Reform Committee* (Chitra Paksha Ayanamsa) | Govt. of India (N. C. Lahiri / M. N. Saha, 1955) | `content-read` |
