/**
 * Team portrait preparation — turn a phone photo into a <=250 KB upload.
 *
 * The admin panel used to ask for a "Photo URL", which is impossible with a
 * photo that only exists on a phone. Now the admin picks a file and this module
 * does the rest in the browser: decode, **centre-crop to a square**, resize,
 * re-encode as JPEG and step the quality down until the result fits the budget.
 * The admin never crops, resizes or compresses anything by hand — choosing the
 * file is the whole job. Only the finished square is sent, so the upload is
 * quick even on mobile data.
 *
 * A square is deliberate: the team cards show a small round/square portrait, so
 * a fixed shape keeps every astrologer the same size instead of leaving a 3:2
 * phone photo letterboxed with white bands.
 *
 * The numbers here are the contract with api/admin/team_photos.php:
 *   * 250 KB hard limit (server rejects anything larger)
 *   * 800 × 800 square output (a card renders it at ~64 px)
 *   * JPEG / PNG / WebP input only (browsers cannot decode HEIC)
 */

/** Hard limit the server enforces too. */
export const TEAM_PHOTO_MAX_BYTES = 250 * 1024;
/** Aim slightly under the limit so JSON/base64 framing never trips it. */
export const TEAM_PHOTO_TARGET_BYTES = 244 * 1024;
/** Edge of the square that is uploaded (and the largest accepted source square). */
export const TEAM_PHOTO_MAX_EDGE = 800;
/** Retained for readers of the old name: the uploaded copy is a square. */
export const TEAM_PHOTO_SQUARE_EDGE = TEAM_PHOTO_MAX_EDGE;
/** A portrait smaller than this is too blurry to publish. */
export const TEAM_PHOTO_MIN_EDGE = 60;
/** Largest file we will even try to decode (a 48 MP phone photo is ~12 MB). */
export const TEAM_PHOTO_MAX_INPUT_BYTES = 30 * 1024 * 1024;

export const TEAM_PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Value for the <input type="file" accept="…"> attribute. */
export const TEAM_PHOTO_ACCEPT = TEAM_PHOTO_ACCEPTED_TYPES.join(',');

/** JPEG qualities tried, best first, before the image is scaled down again. */
export const TEAM_PHOTO_QUALITY_LADDER = [0.9, 0.85, 0.8, 0.72, 0.64, 0.55] as const;
/** Scale factors applied when even the lowest quality is too large. */
export const TEAM_PHOTO_SCALE_STEPS = [1, 0.8, 0.64, 0.5] as const;

export interface PreparedTeamPhoto {
  /** Base64 (no data: prefix) of the JPEG that will be uploaded. */
  base64: string;
  /** data: URL of the same JPEG, for the instant preview. */
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  quality: number;
}

/** "142 KB" — what the admin sees under the preview. */
export function formatTeamPhotoBytes(bytes: number): string {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** True when a prepared photo would be accepted by the server's byte budget. */
export function teamPhotoFitsBudget(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= TEAM_PHOTO_MAX_BYTES;
}

/**
 * The centre square taken from a photo, in source pixels.
 *
 * `size` is the side of the square that will be saved: never larger than the
 * source's shorter edge (no upscaling, which would only blur a small portrait)
 * and never larger than TEAM_PHOTO_MAX_EDGE. A portrait or a panorama is
 * cropped from the middle, which is where a face normally is, and the source
 * rectangle keeps its full resolution so the downscale stays sharp.
 */
export function teamPhotoSquareCrop(
  width: number,
  height: number,
  size: number = TEAM_PHOTO_MAX_EDGE
): { sx: number; sy: number; sw: number; sh: number; size: number } {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const side = Math.min(w, h);
  const wanted = Math.round(Number(size) || 0);
  const out = Math.max(1, Math.min(side, Math.min(TEAM_PHOTO_MAX_EDGE, wanted > 0 ? wanted : TEAM_PHOTO_MAX_EDGE)));
  // Integer source rect, so the crop can never read past the edge of the image.
  return {
    sx: Math.max(0, Math.round((w - side) / 2)),
    sy: Math.max(0, Math.round((h - side) / 2)),
    sw: side,
    sh: side,
    size: out
  };
}

/** Kept as a thin alias: a prepared portrait is always square. */
export function teamPhotoTargetEdge(width: number, height: number, scale = 1): { width: number; height: number } {
  const crop = teamPhotoSquareCrop(width, height, Math.round(TEAM_PHOTO_MAX_EDGE * Math.min(1, Math.max(0.1, scale))));
  return { width: crop.size, height: crop.size };
}

/** The message an admin sees for a file we will not even try to decode. */
export function describeTeamPhotoRejection(file: { type?: string; size?: number; name?: string } | null): string | null {
  if (!file) return 'No photo was chosen.';
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif') || type.includes('heic') || type.includes('heif')) {
    return 'iPhone HEIC photos cannot be used here. In Photos, tap Share → Save as JPG (or change the camera format to “Most Compatible”), then choose that file.';
  }
  if (!TEAM_PHOTO_ACCEPTED_TYPES.includes(type as (typeof TEAM_PHOTO_ACCEPTED_TYPES)[number])) {
    return 'Please choose a JPG, PNG or WebP photo.';
  }
  if (Number(file.size) > TEAM_PHOTO_MAX_INPUT_BYTES) {
    return `That photo is ${formatTeamPhotoBytes(Number(file.size))}. Please choose one under ${formatTeamPhotoBytes(
      TEAM_PHOTO_MAX_INPUT_BYTES
    )}.`;
  }
  return null;
}

/** Strip the "data:image/jpeg;base64," prefix a data URL carries. */
export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The photo could not be read on this device.'));
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  // createImageBitmap is the fast path and understands EXIF orientation;
  // the <img> path covers older Safari.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file is not an image this browser can open.'));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => URL.revokeObjectURL(url)
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('The photo could not be converted. Please try another one.'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Decode, shrink and compress one photo. Throws an Error with an
 * admin-readable message (shown verbatim in the panel) when it cannot.
 */
export async function prepareTeamPhoto(file: File): Promise<PreparedTeamPhoto> {
  const rejection = describeTeamPhotoRejection(file);
  if (rejection) throw new Error(rejection);

  const decoded = await decodeImage(file);
  try {
    if (decoded.width < TEAM_PHOTO_MIN_EDGE || decoded.height < TEAM_PHOTO_MIN_EDGE) {
      throw new Error(`That photo is only ${decoded.width}×${decoded.height} pixels. Please use one at least ${TEAM_PHOTO_MIN_EDGE} pixels wide.`);
    }

    for (const scale of TEAM_PHOTO_SCALE_STEPS) {
      // Centre-crop to a square first, then scale it: cropping after resizing
      // would throw away resolution the card can actually use.
      const crop = teamPhotoSquareCrop(
        decoded.width,
        decoded.height,
        Math.round(TEAM_PHOTO_MAX_EDGE * Math.min(1, Math.max(0.1, scale)))
      );
      const width = crop.size;
      const height = crop.size;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot prepare the photo. Try a different browser.');
      // JPEG has no transparency: white beats the black box that a transparent
      // PNG would otherwise become on the site's dark cards.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

      for (const quality of TEAM_PHOTO_QUALITY_LADDER) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob.size <= TEAM_PHOTO_TARGET_BYTES) {
          const dataUrl = await readAsDataUrl(blob);
          return {
            base64: base64FromDataUrl(dataUrl),
            dataUrl,
            bytes: blob.size,
            width,
            height,
            quality
          };
        }
      }
    }
    throw new Error('This photo could not be reduced to 250 KB. Please try a simpler or smaller image.');
  } finally {
    decoded.release();
  }
}
