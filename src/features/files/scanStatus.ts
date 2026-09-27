// How a file's virus-scan state shows (SPEC §6.5). Colors come from lib/status via StatusChip.
import type { StatusKey } from '../../lib/status';

export function scanChip(scan: string, uploadComplete: boolean): { status: StatusKey; label: string } {
  if (!uploadComplete) return { status: 'pending', label: 'Uploading' };
  switch (scan) {
    case 'clean':
      return { status: 'approved', label: 'Scanned' };
    case 'infected':
      return { status: 'blocked', label: 'Blocked: virus found' };
    case 'too_large_to_scan':
      return { status: 'postponed', label: 'Too large to scan' };
    default:
      return { status: 'pending', label: 'Scanning' };
  }
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Photos open for everyone who can read the folder before the scan (authorize_download, migration 0027). */
export function opensBeforeScan(mime: string, name: string): boolean {
  return PHOTO_TYPES.includes(mime.toLowerCase()) && /\.(jpe?g|png|webp|heic|heif)$/i.test(name);
}
