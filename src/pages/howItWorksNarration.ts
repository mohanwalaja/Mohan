/**
 * ASTRO SIVAM — the How-It-Works voice-over timeline.
 *
 * The walkthrough film opens with a short "Vanakkam" prologue and then narrates
 * the six steps. Every clip is shipped as its own MP3 (`public/audio/`), and the
 * film's chapter windows are BUILT from the clip lengths — never hand-typed — so
 * the pause the listener actually hears between two steps is exactly the two
 * seconds the owner asked for (it used to be ~5 s of dead air because each step
 * kept a whole 17–20 s window around a 12 s recording).
 *
 * `duration` is an MPEG frame walk of the shipped file (MPEG-2 Layer III,
 * 24 kHz mono, 576 samples per frame = exactly 24 ms per frame), not a guess:
 * `tests/howitworks-narration-timing.test.ts` re-walks every shipped clip and
 * fails if a re-recording lands without the table being updated. `captions` are
 * timed against that same clip (clip-relative seconds), aligned to the pauses
 * measured inside it, so the on-screen subtitle and the spoken sentence change
 * together.
 *
 * To re-record the narration: replace the MP3, frame-walk it
 * (`tests/howitworks-narration-timing.test.ts` prints the measured seconds it
 * expects), then update `duration` and the caption boundaries for that clip.
 */
export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

export interface NarrationSegment {
  /** Clip served from `public/`, played from the start of its own window. */
  url: string;
  /** Clip length in seconds (MPEG frames × 24 ms). */
  duration: number;
  /** Captions for this clip, timed from the start of the clip. */
  captions: CaptionLine[];
}

export interface NarrationWindow {
  /** Where the window starts on the film timeline. */
  start: number;
  /** Window end: the clip plus its trailing pause. */
  end: number;
  duration: number;
}

/**
 * Silence between one clip and the next — the owner's correction was
 * "in between the steps in voice nearly 3 to 4 seconds gap there give only two
 * second gap", so this is the single knob that sets it.
 */
export const STEP_GAP_SEC = 2;

export const NARRATION_SEGMENTS: NarrationSegment[] = [
  {
    url: '/audio/intro-vanakkam.mp3',
    duration: 13.32,
    captions: [
      { start: 0, end: 2.66, text: 'Vanakkam! Welcome to Astrosivam.' },
      { start: 2.66, end: 5.42, text: 'Here is your journey, in six simple steps.' },
      { start: 5.42, end: 9.89, text: 'Sign in, choose your service, share your details, and make the payment.' },
      { start: 9.89, end: 13.32, text: 'Then our priest team prepares your report, and it is delivered to you.' },
    ],
  },
  {
    url: '/audio/step-1.mp3',
    duration: 11.688,
    captions: [
      { start: 0, end: 3.45, text: 'Step one: Login and access your account.' },
      { start: 3.45, end: 6.62, text: 'Sign in easily using Google or your email.' },
      { start: 6.62, end: 8.28, text: 'Your account gives you secure, private access' },
      { start: 8.28, end: 11.688, text: 'to your personalized astrological dashboard.' },
    ],
  },
  {
    url: '/audio/step-2.mp3',
    duration: 11.136,
    captions: [
      { start: 0, end: 3.12, text: 'Step two: Select your astrological service.' },
      { start: 3.12, end: 5.2, text: 'Choose a Janma Kundali birth chart,' },
      { start: 5.2, end: 7.81, text: 'marriage compatibility, auspicious baby naming,' },
      { start: 7.81, end: 11.136, text: 'or Subha Muhurtham dates for eighteen sacred ceremonies.' },
    ],
  },
  {
    url: '/audio/step-3.mp3',
    duration: 12.48,
    captions: [
      { start: 0, end: 2.77, text: 'Step three: Fill in user and event details.' },
      { start: 2.77, end: 6.22, text: 'Enter birth data, or choose your ceremony' },
      { start: 6.22, end: 9.06, text: 'and a starting month for Subha Muhurtham.' },
      { start: 9.06, end: 12.48, text: 'Place search helps map precise planetary coordinates.' },
    ],
  },
  {
    url: '/audio/step-4.mp3',
    duration: 11.592,
    captions: [
      { start: 0, end: 2.94, text: 'Step four: Make a secure payment.' },
      { start: 2.94, end: 6.05, text: 'Use Google Pay or UPI for India,' },
      { start: 6.05, end: 8.63, text: 'PayPal for international clients,' },
      { start: 8.63, end: 11.592, text: 'accepting VISA, Mastercard, Amex, and Discover.' },
    ],
  },
  {
    url: '/audio/step-5.mp3',
    duration: 14.568,
    captions: [
      { start: 0, end: 3.2, text: 'Step five: Priest team chart analysis.' },
      { start: 3.2, end: 7.05, text: 'Our senior Sivachariyar Vedic scholars and astrologers' },
      { start: 7.05, end: 10.65, text: 'carefully analyze your planetary chart and Dasha Bhukti,' },
      { start: 10.65, end: 14.568, text: 'or six-month Panchanga Shuddhi Muhurtham windows.' },
    ],
  },
  {
    url: '/audio/step-6.mp3',
    duration: 14.568,
    captions: [
      { start: 0, end: 3.08, text: 'Step six: Admin approval and delivery.' },
      { start: 3.08, end: 6.16, text: 'The administrator verifies and approves your order.' },
      { start: 6.16, end: 10.32, text: 'Your Astrological Report PDF and Tax Invoice' },
      { start: 10.32, end: 14.568, text: 'are prepared daily 9 to 11 AM India time and emailed after approval.' },
    ],
  },
];

/**
 * Windows on the film timeline: segment one starts at 0, every later segment
 * starts immediately after the previous clip plus `STEP_GAP_SEC` of silence.
 */
export const buildNarrationTimeline = (segments: NarrationSegment[] = NARRATION_SEGMENTS): NarrationWindow[] => {
  let cursor = 0;
  return segments.map((segment) => {
    const start = cursor;
    cursor = start + segment.duration + STEP_GAP_SEC;
    return { start, end: cursor, duration: segment.duration };
  });
};
