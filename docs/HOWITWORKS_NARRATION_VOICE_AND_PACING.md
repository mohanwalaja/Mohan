# How-It-Works Film: New Indian Male Voice, Vanakkam Opening, 2-Second Step Pacing

> Field feedback: *"In how it works video in between the steps in voice nearly 3
> to 4 seconds gap there — give only two second gap. I want to change a good
> Indian male voice should speak in Indian style English. Can start with
> vanakkam Welcome to Astrosivam."*

## What was wrong

* The pause between one step's narration ending and the next step's narration
  starting drifted between **2.4 s and 7.6 s** (the step windows were sized for
  an older, longer script), so the film felt slow between chapters.
* The narration voice was the previous session's pick; the owner wanted a
  fresh, good **Indian male voice speaking Indian-style English**.
* The film opened cold on *"Step one: Login…"* with no greeting.

## What changed

### 1. New narration voice + Vanakkam opening

* All six clips in `public/audio/step-*.mp3` were re-recorded with a new
  **Indian male (Indian English) narration voice**, chosen by the owner from a
  two-candidate audition.
* Step one now opens with **"Vanakkam! Welcome to Astro Sivam."** before
  *"Step one: Login and access your account."*
* Steps two to six keep the current PayPal-correct wording (Google Pay / UPI ·
  India; PayPal worldwide; VISA · Mastercard · Amex · Discover), so text and
  voice still agree site-wide.

### 2. Exactly two seconds of silence between steps

Each TTS clip carries ~0.24–0.40 s of leading/trailing silence. Sizing the
step windows by clip length alone would have produced an audible gap of
~2.5 s or more. Instead the timeline was rebuilt from **measured speech
boundaries** (WASM `mpg123` decode → 20 ms RMS buckets → 2 %-of-peak
threshold), so the *perceived* silence is 2.0 s everywhere:

| Step | Window (s) | Clip length (s) | Perceived gap after speech (s) |
|---|---|---|---|
| 1 · Sign in (Vanakkam intro) | 0 → 18.1 | 16.64 | 2.04 |
| 2 · Service | 18.1 → 31.6 | 12.00 | 2.02 |
| 3 · Details | 31.6 → 45.6 | 12.56 | 1.96 |
| 4 · Payment | 45.6 → 57.9 | 10.96 | 2.02 |
| 5 · Analysis | 57.9 → 73.1 | 13.76 | 2.04 |
| 6 · Delivery | 73.1 → 90.3 | 15.52 | 2.00 (tail into the end card) |

* Every step window still fully contains its clip (≥ 1.4 s margin), so no
  narration is ever cut when the playhead crosses a chapter boundary.
* `TOTAL_VIDEO_DURATION` is now **90.3 s** (was 108 s).

### 3. Everything downstream re-synced

* **Captions** re-timed to the detected sentence pauses in the new clips
  (each caption starts/ends on a measured speech segment, not an estimate).
* **`CINEMA_SHOTS`** (wide → B-roll insert → close per step) scaled to the new
  step windows.
* **Walkthrough choreography** re-timed to the new narration segments: cursor
  paths, click moments, email/password typing, service and payment tile
  selection, place-search resolving, Rāsi→D-9 chart switch, admin approval and
  delivery states.
* **Runtime copy**: `108 SEC` → `90 SEC`, `01:48` → `01:30` (poster + end
  card), `1 minute 48 seconds` → `1 minute 30 seconds`, and the two
  `108-second` aria-labels → `90-second`.
* **Cache-busting**: narration URLs now carry `?v=20261015` (`AUDIO_REV`), so
  returning visitors cannot be served the old voice-over from browser cache.
  The retired service worker installs no fetch handler, so no SW purge is
  needed.

## Verification

* `npm run lint` clean, `npm run build` clean (new clips shipped in
  `dist/audio/`, prerendered `dist/pages/how-it-works.html` carries the new
  01:30 / 90 SEC copy with no stale 108-second strings).
* Full `npm test` suite passes.
* Gap table above re-measured from the shipped MP3s (MPEG frame walk for
  duration; decoded RMS envelope for speech boundaries).
