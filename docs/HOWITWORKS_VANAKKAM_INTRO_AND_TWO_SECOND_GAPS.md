# How-It-Works: the Vanakkam opening, the new Indian-English voice, and the two-second gaps

> Field feedback: *"I need one correction in how it works video in between the
> steps in voice nearly 3 to 4 seconds gap there give only two second gap."*
>
> *"I want to change a good indian male voice should speak in Indian style
> English. Can start with vanakkam Welcome to Astrosivam. After can explain
> about the all 6 steps."*

## What was wrong

1. **Dead air between the steps.** Each step had a hand-typed timeline slot
   (17 / 20 / 19 / 14 / 19 / 19 s) wrapped around a ~12 s recording, so after the
   narrator finished a step the listener sat through roughly **4–5 seconds of
   silence** before the next step started — the "3 to 4 second gap" in the
   feedback, and worse in the later steps.
2. **The film did not open with a welcome.** Play started straight into
   "Step one: Login and access your account."
3. **The narration voice needed to change.** The owner wanted a good Indian male
   voice reading Indian-style English throughout.

## What changed

### 1. A two-second pause is now structural, not typed

`src/pages/howItWorksNarration.ts` is the single home for the voice-over: seven
clips (a prologue plus the six steps), each with its **frame-walked** duration
and its captions. `buildNarrationTimeline()` then builds the film's windows:

```
window = its own clip's length + STEP_GAP_SEC        (STEP_GAP_SEC = 2)
```

`src/pages/HowItWorksPage.tsx` no longer contains a single hand-typed
`startSec`/`endSec`, `108`, `01:48` or "1 minute 48 seconds" — the chapter
window, the chapter markers, the poster/end-card clock, the corner mark
(`103 SEC · INDIAN ENGLISH VOICE`) and the hero fact all derive from the table.
Record a clip again and the whole film re-times itself.

Each recorded clip was also **trimmed of the generator's own silence padding**
(frame-granular, 24 ms per MPEG frame), so the pause the listener actually hears
is the two seconds the timeline promises instead of two seconds *plus* the
padding that used to sit at both ends of every file.

### 2. The film opens with "Vanakkam! Welcome to Astrosivam."

`public/audio/intro-vanakkam.mp3` (13.32 s) is the new prologue: the narrator
greets the visitor, promises "your journey, in six simple steps", and then names
them — sign in, choose your service, share your details, make the payment, the
priest team prepares the report, and it is delivered. The film shows a
**PROLOGUE** card (not "CHAPTER 01") over a lamp-lit sanctum opener, then the
narrator plate, then the chart plate, and chapter 01 begins at 15.32 s.

### 3. One Indian-English male narrator for the whole film

All clips were re-recorded in the same Indian-English male voice
(`voice-00`), and the on-screen credits follow: the corner mark reads
**INDIAN ENGLISH VOICE**, the narrator card reads *Original Indian English
narration*, the hero copy says *an original Indian English male narration*, and
the poster line is *Vanakkam welcome · six steps · Indian English narration*.

### The narration table (as shipped)

| Clip | Frames | Clip length | Window on the timeline |
|---|---|---|---|
| `intro-vanakkam.mp3` | 555 | 13.320 s | 0 → 15.320 |
| `step-1.mp3` | 487 | 11.688 s | 15.320 → 29.008 |
| `step-2.mp3` | 464 | 11.136 s | 29.008 → 42.144 |
| `step-3.mp3` | 520 | 12.480 s | 42.144 → 56.624 |
| `step-4.mp3` | 483 | 11.592 s | 56.624 → 70.216 |
| `step-5.mp3` | 607 | 14.568 s | 70.216 → 86.784 |
| `step-6.mp3` | 607 | 14.568 s | 86.784 → 103.352 |

Film runtime **103.352 s → "1 minute 43 seconds"**, down from 108 s.

### 4. Captions re-measured against the clips

Every caption line is now timed to a pause **inside its own recording** (the
pauses were measured on the decoded audio and each caption boundary snapped to
the end of a real pause), so the subtitle changes exactly when the spoken
sentence does. `SouthIndianChart`, the UI-walkthrough cursor beats and the
click moments were re-fitted to the shorter windows.

### 5. The shot list follows the windows

`CINEMA_SHOTS` was rebuilt from the narration windows (21 cuts: title opener,
wide, mid-step B-roll insert, closing frame per chapter) so no cut can fall
outside its chapter any more.

## Verification

* `tests/howitworks-narration-timing.test.ts` (new, wired into `npm test`)
  frame-walks the shipped MP3s and enforces all of the above: seven clips, the
  Vanakkam opening, declared duration == shipped clip, mono 24 kHz
  MPEG-2 Layer III, **exactly 2 s of silence between clips**, no dead timeline,
  captions inside their clip and in order, and "the page derives its windows and
  runtime labels from the table" (no `108`/`01:48`/`startSec: 0` may return).
* `npm run lint` clean, `npm test` 607 checks pass, `npm run build` clean with
  all seven clips in `dist/audio/`.

## Still to do (next continue)

Steps 3–6 still carry the **previous** recording — the voice platform allows ten
new clips per turn and the prologue + steps 1–2 used them. The follow-up
re-records `step-3 … step-6` in the same Indian-English voice, then:

1. measure them exactly as above (frame walk + pause alignment) and update
   `NARRATION_SEGMENTS` in `src/pages/howItWorksNarration.ts`;
2. re-run `npm test` — the timing test prints the measured seconds it expects if
   a table entry is stale;
3. the windows, chapter markers, runtime labels and shot list follow automatically.
