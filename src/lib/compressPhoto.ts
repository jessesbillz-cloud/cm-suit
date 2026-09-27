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

/** Compresses a photo. Non-image files are rejected, never passed through silently. */
export async function compressPhoto(file: Blob): Promise<Blob> {
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
