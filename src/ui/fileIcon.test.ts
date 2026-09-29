import { File, FileText, Image, Sheet } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { fileIcon } from './fileIcon';

describe('fileIcon', () => {
  it('reads the type first', () => {
    expect(fileIcon('scan', 'application/pdf')).toBe(FileText);
    expect(fileIcon('photo', 'image/jpeg')).toBe(Image);
    expect(fileIcon('list', 'text/csv')).toBe(Sheet);
    expect(fileIcon('book', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(Sheet);
  });
  it('falls back to the extension', () => {
    expect(fileIcon('Sample Plan Set.PDF')).toBe(FileText);
    expect(fileIcon('sample-photo.heic', 'application/octet-stream')).toBe(Image);
    expect(fileIcon('Sample takeoff.xlsx', null)).toBe(Sheet);
  });
  it('uses a plain file for anything else', () => {
    expect(fileIcon('Sample model.dwg')).toBe(File);
    expect(fileIcon('README')).toBe(File);
  });
});
