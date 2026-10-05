// Previews (the app's file viewer): which files may be shown, and how long a preview URL lives. A photo is shown as a
// picture; a PDF (0074) is read by pdf.js in the app. authorize_preview() (migrations 0047, 0074) already refuses
// anything else; the download function checks again before it signs, so a preview URL is never handed out for an
// HTML page, an SVG or anything else a browser might run.

/** A preview URL lives 10 minutes, like a download URL (db.ts signedDownloadUrl); the app caches it for less
 *  (src/data/preview.ts). */
export const PREVIEW_TTL_SECONDS = 600;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

/** An image by its mime AND its file name (the same rule as the database's). SVG is never one: it can carry script. */
export function isPreviewImage(mime: string, name: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase()) && IMAGE_NAME.test(name);
}

/** A PDF by its mime AND its file name (the same rule as the database's, 0074). */
export function isPreviewPdf(mime: string, name: string): boolean {
  return mime.toLowerCase() === 'application/pdf' && /\.pdf$/i.test(name);
}

/** What the viewer may show: a photo or a PDF. */
export function isPreviewable(mime: string, name: string): boolean {
  return isPreviewImage(mime, name) || isPreviewPdf(mime, name);
}
