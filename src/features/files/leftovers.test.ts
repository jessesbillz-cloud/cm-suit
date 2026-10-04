import { describe, expect, it } from 'vitest';
import type { UploadItem } from '../../data/UploadQueue';
import type { FileRow } from '../../data/types';
import { leftoverUploads, storedFiles } from './leftovers';

function row(id: string, uploadComplete: boolean, name = `${id}.pdf`, size = 100): FileRow {
  return {
    id,
    project_id: 'job',
    folder_id: 'plans',
    original_name: name,
    mime: 'application/pdf',
    size,
    scan_status: 'pending',
    upload_complete: uploadComplete,
    created_at: '2026-10-03T16:00:00Z',
    created_by: 'me',
  };
}

function line(p: Partial<UploadItem>): UploadItem {
  return {
    key: 1,
    name: 'Sample.pdf',
    size: 100,
    loaded: 0,
    status: 'uploading',
    error: null,
    retryable: true,
    unfinishedId: null,
    removing: false,
    note: null,
    projectId: 'job',
    folderId: 'plans',
    ...p,
  };
}

describe('unfinished uploads in a folder', () => {
  const rows = [row('a', true), row('b', false), row('c', false, 'Sample.pdf')];

  it('only a finished upload is a file', () => {
    expect(storedFiles(rows).map((f) => f.id)).toEqual(['a']);
  });

  it('an unfinished upload with no line in the queue is a leftover', () => {
    expect(leftoverUploads(rows, []).map((f) => f.id)).toEqual(['b', 'c']);
  });

  it('a line that registered the row stands for it, whatever its state (failed, stopped, uploading)', () => {
    for (const status of ['failed', 'cancelled', 'uploading'] as const) {
      expect(leftoverUploads(rows, [line({ status, unfinishedId: 'b', name: 'other.pdf' })]).map((f) => f.id)).toEqual(['c']);
    }
  });

  it('the same file added again takes its leftover over before it is registered', () => {
    expect(leftoverUploads(rows, [line({ status: 'queued' })]).map((f) => f.id)).toEqual(['b']);
    expect(leftoverUploads(rows, [line({ status: 'uploading' })]).map((f) => f.id)).toEqual(['b']);
  });

  it('but not a different size, another folder, or a line that failed before it registered', () => {
    expect(leftoverUploads(rows, [line({ size: 101 })]).map((f) => f.id)).toEqual(['b', 'c']);
    expect(leftoverUploads(rows, [line({ folderId: 'specs' })]).map((f) => f.id)).toEqual(['b', 'c']);
    expect(leftoverUploads(rows, [line({ status: 'failed' })]).map((f) => f.id)).toEqual(['b', 'c']);
  });

  it('a line that registered another row does not hide this one, even with the same name', () => {
    expect(leftoverUploads(rows, [line({ unfinishedId: 'z' })]).map((f) => f.id)).toEqual(['b', 'c']);
  });
});
