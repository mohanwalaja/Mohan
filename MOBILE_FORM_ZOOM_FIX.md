# Mobile Birth-Details Form: Page Zoom / Sideways Pan Fix

> Field report (with screenshot, Android Chrome, `/birth-jathagam`):
> *"When the user is filling the form it's zooming and can't zoom out again."*
> *"Once I fill date of birth and time it's going towards right side and can't
> get to left again; after reload the page it's normally loading."*

Three separate mobile-browser behaviours combined to produce the stuck,
zoomed / sideways page. Each is now removed at its root.

## 1. The inputs were 1×1 px at the moment of focus

`BirthDateField` / `BirthTimeField` rendered the text input with `sr-only`
while inactive and swapped it to visible in `onFocus`, showing a decorative
right-aligned value `<span>` instead. Focusing a 1 px editable is exactly what
mobile Chrome / Safari "make the focused field visible" heuristics react to:
the browser pans / zooms the visual viewport toward the field, so the page
jumped sideways the instant the visitor tapped the date or time row.

**Fix:** the inputs are now always visible (they already were `text-base`
= 16 px on mobile, so iOS focus-zoom never triggers either). The decorative
span and the `sr-only` swap are gone from both fields in
`src/components/common/BirthDateTimeFields.tsx`.

## 2. `overflow-x: hidden` still allowed programmatic sideways scrolling

With `hidden`, the document *can* be scrolled horizontally by script and by
the browser's focus scroll-into-view — but the visitor's finger cannot scroll
it back. That is precisely "it goes right and I can't get to left again,
reload fixes it".

**Fix:** `overflow-x: clip` on `html, body` and `.astro-app` in
`src/index.css`. `clip` forbids horizontal scrolling of every kind (user and
programmatic) while keeping vertical scrolling and `position: sticky` intact.
`hidden` remains as the fallback for engines without `clip`, and
`src/main.tsx` adds a `focusin` listener that resets any residual
`scrollLeft` on older browsers.

## 3. Double-tap-to-zoom on the non-input tap targets

Quick consecutive taps while filling the form (value row, AM/PM chips,
gender / language / GPS buttons) triggered the browser double-tap zoom
gesture, because only `input, textarea, select` carried
`touch-action: manipulation`.

**Fix:** a global `* { touch-action: manipulation; }` in `src/index.css`
removes the double-tap zoom gesture everywhere while keeping pinch zoom
available for accessibility (no `user-scalable=no`). Leaflet sets its own
inline `touch-action` on the map, which overrides the rule. The AM/PM chips
also carry `touch-manipulation` explicitly.

## 4. Keyboard-open viewport stability

`index.html` viewport meta is now
`width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content`
so the Android soft keyboard resizes content instead of squeezing /
re-scaling the visual viewport while typing.

## Regression guards

`tests/mobile-inputs.test.tsx` TEST 6 fails the build if any layer is
removed: the global `touch-action: manipulation` rule, the 16 px mobile
input rule, the absence of `sr-only` on the date/time inputs,
`overflow-x: clip`, and the viewport meta contents.

```bash
npm run lint   # tsc --noEmit
npm test       # full suite incl. mobile-inputs
npm run build  # vite build; built CSS verified to contain the new rules
```
