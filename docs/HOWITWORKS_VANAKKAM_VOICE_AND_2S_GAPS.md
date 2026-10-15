# How-It-Works Voice-Over: Vanakkam Opening, One Consistent Indian Voice, 2-Second Step Gaps

> Field feedback: *"in between the steps … nearly 3 to 4 seconds gap … give 2 second
> gap"*, *"I want to change a good Indian male voice should speak in Indian style
> English"*, *"Can you start with Vanakkam"*, and *"new voice and first voice
> mismatching"*.

## What changed

* **One consistent voice.** All six narration clips in `public/audio/step-*.mp3`
  were re-recorded **in a single batch** with one good Indian male voice
  (Indian-style English), so every step — including the first — sounds like the
  same speaker. The earlier mismatch came from re-recording step 1 in a separate
  batch after the Vanakkam request; separately, `.htaccess` gives `mp3` the
  `ExpiresDefault "access plus 1 month"`, so browsers could mix month-old cached
  clips with fresh ones.
* **Vanakkam opening.** Step 1 now begins *"Vanakkam! Welcome to ASTRO SIVAM."*
  (new first caption line), followed by the step-one script.
* **2-second voice gaps.** The silent gap between one step's speech and the next
  step's speech is now **exactly 2.00 s** (was ~3–8 s). The video also closes
  2 s after the last words. The timeline was rebuilt around measured speech
  bounds (PCM decode of each clip): step windows now start at
  0 / 16.60 / 30.48 / 43.75 / 55.95 / 71.19 s, total **87.64 s** (was 108 s).
* **Sync kept.** Captions were re-timed inside each step (proportional to the
  new speech span), and the demo UI beats, cursor paths and click moments were
  rescaled the same way so the walkthrough stays aligned with the narration.
* **Cache-busting.** Narration URLs now carry `?v=${AUDIO_VERSION}` so a new
  recording is always fetched after a deploy.
* Step-4 payment wording is unchanged and consistent with the rest of the site:
  Google Pay / UPI (India), PayPal (worldwide), VISA · Mastercard · Amex ·
  Discover.

## Verification

`npm run lint` clean, `npm run build` clean (new clips shipped in `dist/audio/`),
`npm test` passes. All five inter-step voice gaps measured at 2.00 s
(speech-end → next speech-start).
