// Which files show as a picture: a JPEG, PNG, WebP or HEIC by type AND name, the same rule the server's preview gate
// uses (migration 0047, supabase/functions/_shared/images.ts). The server decides; this only picks a picture tile over a
// file tile. SVG is never a photo (it can carry script).

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const PHOTO_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isPhotoFile(name: string, mime: string | null | undefined): boolean {
  return PHOTO_TYPES.has((mime ?? '').toLowerCase()) && PHOTO_NAME.test(name);
}
