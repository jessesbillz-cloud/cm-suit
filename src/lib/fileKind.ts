// What the file viewer does with a file: show a photo, draw a PDF's pages, or offer a Download. Photos follow
// lib/photos (type AND name, like the server's preview gate); a PDF is application/pdf with a .pdf name. Without a
// type (a list that only knows names) the name decides, and the server still refuses anything it won't show.
import { isPhotoFile } from './photos';

type FileKind = 'image' | 'pdf' | 'other';

const PHOTO_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;
const PDF_NAME = /\.pdf$/i;

export function fileKind(name: string, mime?: string | null): FileKind {
  if (mime === undefined || mime === null || mime === '') {
    if (PHOTO_NAME.test(name)) return 'image';
    return PDF_NAME.test(name) ? 'pdf' : 'other';
  }
  if (isPhotoFile(name, mime)) return 'image';
  return mime.toLowerCase() === 'application/pdf' && PDF_NAME.test(name) ? 'pdf' : 'other';
}
