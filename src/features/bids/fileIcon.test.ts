import { describe, expect, it } from 'vitest';
import { File, FileArchive, FileImage, FileSpreadsheet, FileText } from 'lucide-react';
import { fileIcon } from './fileIcon';

describe('fileIcon', () => {
  it('reads the MIME type first', () => {
    expect(fileIcon('application/pdf', 'Sample.bin')).toBe(FileText);
    expect(fileIcon('image/jpeg', 'Sample')).toBe(FileImage);
    expect(fileIcon('text/csv', 'Sample.txt')).toBe(FileSpreadsheet);
    expect(fileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sample')).toBe(FileSpreadsheet);
    expect(fileIcon('application/zip', 'Sample')).toBe(FileArchive);
  });
  it('falls back to the extension, then a plain file', () => {
    expect(fileIcon(null, 'Sample Plan Set.PDF')).toBe(FileText);
    expect(fileIcon('', 'Sample takeoff.xlsx')).toBe(FileSpreadsheet);
    expect(fileIcon(undefined, 'Sample drawing.dwg')).toBe(File);
    expect(fileIcon(undefined, 'no extension')).toBe(File);
  });
});
