import { describe, expect, it } from 'vitest';
import type { StampedFile } from '../../data/permitStamp.types';
import { doneLabel, leftToStamp, matchesSource, signLabel, stampLabel, stateWord, togglePick } from './stamp';

const stamped = (id: string): StampedFile => ({
  source_file_id: id,
  stamped_file_id: `${id}-stamped`,
  stamped_at: '2026-10-01T17:00:00Z',
  name: `${id} - Approved 24-0001.pdf`,
  pages: 1,
});

describe('the stamp flow', () => {
  it('names the button for what stamping does now', () => {
    expect(stampLabel('issue')).toBe('Stamp and issue');
    expect(stampLabel('revise')).toBe('Stamp revision');
    expect(signLabel('issue', 0)).toBe('Stamp and issue');
    expect(signLabel('revise', 3)).toBe('Stamp revision (3)');
  });
  it('finds a PDF by any words of its name or folder', () => {
    const s = { name: 'Sample A-101 Floor Plan.pdf', folder_name: 'Plans' };
    expect(matchesSource(s, '')).toBe(true);
    expect(matchesSource(s, 'a-101 plans')).toBe(true);
    expect(matchesSource(s, 'floor  PLAN')).toBe(true);
    expect(matchesSource(s, 'a-201')).toBe(false);
  });
  it('keeps the picked order; a second tap drops it', () => {
    expect(togglePick([], 'a')).toEqual(['a']);
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('a retry stamps only what has no copy yet', () => {
    expect(leftToStamp(['a', 'b', 'c'], { b: stamped('b') })).toEqual(['a', 'c']);
    expect(leftToStamp(['a'], { a: stamped('a') })).toEqual([]);
  });
  it('one word per file, one line at the end', () => {
    expect(['stamping', 'stamped', 'failed'].map((s) => stateWord(s as 'stamping'))).toEqual(['Stamping', 'Stamped', 'Failed']);
    expect(doneLabel({ set_no: 1, files: 2, issued: true })).toBe('Permit issued. Approved set: 2 files.');
    expect(doneLabel({ set_no: 2, files: 1, issued: false })).toBe('Approved set revised: 1 file.');
  });
});
