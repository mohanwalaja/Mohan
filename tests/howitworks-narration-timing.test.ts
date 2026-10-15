/**
 * ASTRO SIVAM — the How-It-Works voice-over must keep its two-second gaps.
 *
 * WHY THIS EXISTS: the owner's correction was *"in between the steps in voice
 * nearly 3 to 4 seconds gap there give only two second gap"*, and *"can start
 * with vanakkam Welcome to Astrosivam … after can explain about all 6 steps"*.
 * Both are properties of the SHIPPED AUDIO, so this test measures the shipped
 * MP3s instead of trusting the source table:
 *
 *  1. every clip in `src/pages/howItWorksNarration.ts` is frame-walked here
 *     (MPEG frames are exact — a clip's length is `frames × samples / rate`),
 *     so a re-recording that lands without the table being updated fails;
 *  2. the window builder must place exactly `STEP_GAP_SEC` (2 s) of silence
 *     between one clip and the next, with no gap in the timeline either — a
 *     "fix" that quietly restores the old 17–20 s windows fails;
 *  3. captions must stay inside their own clip, in order, and cover it to the
 *     end, so the on-screen line and the spoken step cannot drift apart;
 *  4. the page must DERIVE its chapter windows and runtime labels from that
 *     table — hard-typed `startSec: 0` / `108` style times must not creep back.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NARRATION_SEGMENTS, STEP_GAP_SEC, buildNarrationTimeline } from '../src/pages/howItWorksNarration';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

interface Mp3Info {
  frames: number;
  seconds: number;
  sampleRate: number;
  channels: number;
  bytes: number;
}

const BITRATES: Record<string, number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MPEG frame walk: the length a browser reports for a VBR-free MP3. */
function frameWalk(file: string): Mp3Info {
  const buffer = fs.readFileSync(file);
  let offset = 0;
  if (buffer.length > 10 && buffer.toString('latin1', 0, 3) === 'ID3') {
    offset = 10 + (((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f));
  }
  let frames = 0;
  let seconds = 0;
  let bytes = 0;
  let sampleRate = 0;
  let channels = 0;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (buffer[offset + 1] >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (buffer[offset + 1] >> 1) & 0x03; // 3 = I, 2 = II, 1 = III
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset += 1;
      continue;
    }
    const versionKey = version === 3 ? '1' : '2';
    const layerKey = layer === 3 ? '1' : layer === 2 ? '2' : '3';
    const bitrate = BITRATES[`${versionKey}-${layerKey}`][bitrateIndex];
    const rate = SAMPLE_RATES[version][sampleRateIndex];
    const padding = (buffer[offset + 2] >> 1) & 0x01;
    const samplesPerFrame = layer === 3 ? 384 : layer === 2 ? 1152 : version === 3 ? 1152 : 576;
    const frameLength = Math.floor((samplesPerFrame / 8) * bitrate * 1000 / rate + padding);
    if (frameLength <= 4) {
      offset += 1;
      continue;
    }
    if (!sampleRate) {
      sampleRate = rate;
      channels = ((buffer[offset + 3] >> 6) & 0x03) === 3 ? 1 : 2;
    }
    frames += 1;
    bytes += frameLength;
    seconds += samplesPerFrame / rate;
    offset += frameLength;
  }
  return { frames, seconds, sampleRate, channels, bytes };
}

const measured = new Map<string, Mp3Info>();
for (const segment of NARRATION_SEGMENTS) {
  const file = path.join(projectRoot, 'public', segment.url.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), `missing narration clip ${segment.url} (expected at ${file})`);
  measured.set(segment.url, frameWalk(file));
}

console.log('--- HOW-IT-WORKS NARRATION TIMING ---');

check('seven narration clips ship — a Vanakkam prologue plus the six steps', () => {
  assert.equal(NARRATION_SEGMENTS.length, 7, 'expected prologue + 6 steps');
  assert.equal(NARRATION_SEGMENTS[0].url, '/audio/intro-vanakkam.mp3', 'the film must open with the Vanakkam prologue clip');
  NARRATION_SEGMENTS.slice(1).forEach((segment, index) => {
    assert.equal(segment.url, `/audio/step-${index + 1}.mp3`, `step ${index + 1} must keep its own clip`);
  });
});

check('the prologue clip is the one that says Vanakkam and welcomes the visitor', () => {
  const prologueCaption = NARRATION_SEGMENTS[0].captions.map((caption) => caption.text).join(' ');
  assert.match(prologueCaption, /Vanakkam/i, 'the opening caption must be the Vanakkam greeting');
  assert.match(prologueCaption, /Welcome to Astrosivam/i, 'the opening caption must welcome the visitor');
  assert.match(prologueCaption, /six simple steps/i, 'the prologue must introduce the six steps it then walks through');
});

check('every declared duration is the shipped clip\u2019s own frame-walked length', () => {
  const drifted: string[] = [];
  for (const segment of NARRATION_SEGMENTS) {
    const info = measured.get(segment.url);
    assert.ok(info, `no measurement for ${segment.url}`);
    if (Math.abs(info.seconds - segment.duration) > 0.03) {
      drifted.push(`${segment.url}: table says ${segment.duration}s, the shipped clip is ${info.seconds.toFixed(3)}s (${info.frames} frames)`);
    }
  }
  assert.deepEqual(drifted, [], `re-recorded clips need the narration table updated:\n    ${drifted.join('\n    ')}`);
});

check('clips stay in the small mono MPEG-2 Layer III format the player has always shipped', () => {
  for (const segment of NARRATION_SEGMENTS) {
    const info = measured.get(segment.url)!;
    assert.equal(info.sampleRate, 24000, `${segment.url} sample rate changed (${info.sampleRate} Hz)`);
    assert.equal(info.channels, 1, `${segment.url} is no longer mono`);
    assert.ok(info.bytes < 120_000, `${segment.url} grew past 120 kB (${info.bytes} bytes) — the film loads lazily but should stay light`);
  }
});

check('the gap between two steps is exactly two seconds of silence', () => {
  assert.equal(STEP_GAP_SEC, 2, 'the owner asked for a two-second pause between steps');
  const timeline = buildNarrationTimeline();
  assert.equal(timeline.length, NARRATION_SEGMENTS.length);
  timeline.forEach((window, index) => {
    const segment = NARRATION_SEGMENTS[index];
    const pause = Math.round((window.end - (window.start + window.duration)) * 1000) / 1000;
    assert.equal(pause, STEP_GAP_SEC, `${segment.url}: ${pause}s of silence after the clip, expected ${STEP_GAP_SEC}s`);
    if (index > 0) {
      assert.equal(window.start, timeline[index - 1].end, `${segment.url}: window must start when the previous window ends (no dead timeline)`);
    }
  });
  assert.equal(timeline[0].start, 0, 'the film starts at zero');
});

check('each step\u2019s window is its own recording plus that pause — not the old 17\u201320 s slots', () => {
  const timeline = buildNarrationTimeline();
  timeline.forEach((window, index) => {
    const length = Number((window.end - window.start).toFixed(3));
    const expected = Number((NARRATION_SEGMENTS[index].duration + STEP_GAP_SEC).toFixed(3));
    assert.equal(length, expected, `${NARRATION_SEGMENTS[index].url}: window is ${length}s, should be its ${NARRATION_SEGMENTS[index].duration}s clip plus the ${STEP_GAP_SEC}s pause`);
  });
  const total = timeline[timeline.length - 1].end;
  const expected = Number((NARRATION_SEGMENTS.reduce((sum, segment) => sum + segment.duration, 0) + NARRATION_SEGMENTS.length * STEP_GAP_SEC).toFixed(3));
  assert.ok(Math.abs(total - expected) < 0.001, `film runtime ${total}s should be every clip plus every pause (${expected}s)`);
});

check('captions stay inside their clip, in order, and cover it to the end', () => {
  for (const segment of NARRATION_SEGMENTS) {
    const captions = segment.captions;
    assert.ok(captions.length >= 4, `${segment.url} should keep its four caption lines`);
    captions.forEach((caption, index) => {
      assert.ok(caption.text.trim().length > 0, `${segment.url} caption ${index + 1} is empty`);
      assert.ok(caption.start >= 0 && caption.end > caption.start, `${segment.url} caption ${index + 1} has an empty or negative window`);
      assert.ok(caption.end <= segment.duration + 0.001, `${segment.url} caption ${index + 1} ends at ${caption.end}s, past the clip (${segment.duration}s)`);
      if (index > 0) {
        assert.ok(caption.start >= captions[index - 1].start, `${segment.url} caption ${index + 1} starts before caption ${index}`);
        assert.ok(caption.start <= captions[index - 1].end + 0.001, `${segment.url} has a caption hole between lines ${index} and ${index + 1}`);
      }
      assert.ok(caption.text.length < 80, `${segment.url} caption ${index + 1} is too long for the subtitle band`);
    });
    assert.ok(Math.abs(captions[captions.length - 1].end - segment.duration) < 0.02, `${segment.url}: the last caption must reach the end of the clip`);
  }
});

check('the page derives its chapter windows and runtime labels from that table', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'src/pages/HowItWorksPage.tsx'), 'utf8');
  assert.match(page, /import \{\s*NARRATION_SEGMENTS,/, 'HowItWorksPage must use the shared narration table');
  assert.match(page, /const NARRATION_TIMELINE = buildNarrationTimeline\(\);/, 'the page builds its timeline from the narration table');
  assert.match(page, /startSec: NARRATION_TIMELINE\[index \+ 1\]\.start/, 'step windows must come from the timeline');
  assert.match(page, /const TOTAL_VIDEO_DURATION = NARRATION_TIMELINE\[/, 'the runtime must be derived, never hand-typed');
  assert.doesNotMatch(page, /TOTAL_VIDEO_DURATION\s*=\s*108/, 'the old hard-typed 108-second runtime must not come back');
  assert.doesNotMatch(page, /^\s{4}startSec:\s*\d+,/m, 'no hand-typed chapter start times');
  assert.doesNotMatch(page, /108 SEC|1 minute 48 seconds|01:48/, 'no hand-typed runtime labels');
});

console.log(`\n  ${passed} checks passed — every step pauses ${STEP_GAP_SEC}s and the film runs ${buildNarrationTimeline().slice(-1)[0].end.toFixed(2)}s.`);
