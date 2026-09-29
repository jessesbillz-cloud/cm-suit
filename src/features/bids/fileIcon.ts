// The Lucide icon for a file's type, from its MIME type (else its extension): documents, drawings and photos,
// spreadsheets, archives, anything else.
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';

const BY_EXT: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  zip: FileArchive,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  heic: FileImage,
};

export function fileIcon(mime: string | null | undefined, name: string): LucideIcon {
  const m = mime ?? '';
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('sheet') || m.includes('excel') || m === 'text/csv') return FileSpreadsheet;
  if (m === 'application/pdf' || m.startsWith('text/') || m.includes('word')) return FileText;
  if (m.includes('zip')) return FileArchive;
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return BY_EXT[ext] ?? File;
}
