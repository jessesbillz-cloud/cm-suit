// The ONE photo compressor (CLAUDE.md rule 11). Canvas based, runs in the browser only.
// Output: JPEG at quality 0.82, longest edge at most 2000px, EXIF orientation applied.
//
// Camera input note: <input type="file" accept="image/*" capture="environment"> opens the camera directly on
// Android. iOS ignores `capture` for multi-select and shows Apple's own sheet (outside our control, SPEC §7.7);
// keep `capture` anyway so Android goes straight to the camera.

const MAX_EDGE = 2000;
const QUALITY = 0.82;

/** Scales (w, h) down so the longest edge is at most `max`. Never scales up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('This photo could not be compressed.'));
      },
      'image/jpeg',
      QUALITY,
    );
  });
}

/** Stamp text height for a photo of this size: readable on a phone, small on the page. */
function stampSize(width: number, height: number): number {
  return Math.max(14, Math.round(Math.min(width, height) * 0.028));
}

/** Burns a one-line stamp (e.g. "Sample Job A · Sep 26, 2026 4:05 PM") into the bottom-left corner on a dark band. */
function drawStamp(ctx: CanvasRenderingContext2D, text: string, width: number, height: number): void {
  const size = stampSize(width, height);
  const pad = Math.round(size / 2);
  ctx.font = `600 ${String(size)}px Inter, system-ui, sans-serif`;
  const bandW = Math.min(ctx.measureText(text).width + pad * 2, width);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, height - size - pad * 2, bandW, size + pad * 2);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'bottom';
  // maxWidth squeezes a long stamp to fit; it is never cut off.
  ctx.fillText(text, pad, height - pad, width - pad * 2);
}

/**
 * Compresses a photo. Non-image files are rejected, never passed through silently. `stamp`, when given, is burned into
 * the photo (job, date and time, SPEC §7.7), so it travels with the image wherever it is seen.
 */
export async function compressPhoto(file: Blob, stamp?: string): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Only photos can be compressed.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const size = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot compress photos.');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    if (stamp) drawStamp(ctx, stamp, size.width, size.height);
    return await canvasToJpeg(canvas);
  } finally {
    bitmap.close();
  }
}

/** A compressed photo keeps its base name with a .jpg extension. */
export function jpegName(original: string): string {
  const dot = original.lastIndexOf('.');
  return `${dot > 0 ? original.slice(0, dot) : original}.jpg`;
}
