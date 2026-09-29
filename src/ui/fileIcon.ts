// The icon for a file's kind, by its type or, failing that, its extension: FileText for PDFs and documents, Image for
// photos, Sheet for spreadsheets, a plain File for anything else. One table for Files, attachments and RFI files.
import { File, FileArchive, FileText, Image, Sheet, type LucideIcon } from 'lucide-react';

const BY_EXT: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  rtf: FileText,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  webp: Image,
  heic: Image,
  heif: Image,
  tif: Image,
  tiff: Image,
  xls: Sheet,
  xlsx: Sheet,
  xlsm: Sheet,
  csv: Sheet,
  zip: FileArchive,
};

export function fileIcon(name: string, mime?: string | null): LucideIcon {
  const m = mime ?? '';
  if (m.startsWith('image/')) return Image;
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return Sheet;
  if (m === 'application/pdf' || m.startsWith('text/') || m.includes('wordprocessing') || m === 'application/msword') return FileText;
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return BY_EXT[ext] ?? File;
}
