// Photo previews: which files may be shown as a picture, and how long a preview URL lives.
// authorize_preview() (migration 0047) already refuses anything else; the download function checks again before it
// signs, so a preview URL is never handed out for a PDF, a plan or a bid.

/** A preview URL lives 10 minutes, like a download URL (db.ts signedDownloadUrl); the app caches it for less
 *  (src/data/preview.ts). */
export const PREVIEW_TTL_SECONDS = 600;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

/** An image by its mime AND its file name (the same rule as the database's). SVG is never one: it can carry script. */
export function isPreviewImage(mime: string, name: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase()) && IMAGE_NAME.test(name);
}
