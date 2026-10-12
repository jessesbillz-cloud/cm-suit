import { describe, expect, it } from 'vitest';
import { toDataError } from '../../data/errors';
import type { Outcome } from '../../data/files';
import { done, howMany, refusedLine } from './outcomes';

const name = (s: string) => s;

describe('the words of a batch of file writes', () => {
  it('names one file, counts more', () => {
    expect(howMany(['Plan.pdf'])).toBe('Plan.pdf');
    expect(howMany(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('3 files');
  });

  it('keeps the writes that went through, with what each answered', () => {
    const results: Outcome<string, number>[] = [
      { ok: true, item: 'a.pdf', value: 2 },
      { ok: false, item: 'b.pdf', error: new Error('x') },
    ];
    expect(done(results)).toEqual([{ item: 'a.pdf', value: 2 }]);
  });

  it("says what was refused in the database's words, the first reason for all", () => {
    const refused = toDataError({ message: 'A signed record stays on file.', code: '42501' });
    const one: Outcome<string, number>[] = [{ ok: false, item: 'Daily.pdf', error: refused }];
    expect(refusedLine(one, name, 'deleted')).toBe('Daily.pdf not deleted: A signed record stays on file.');
    const two: Outcome<string, number>[] = [...one, { ok: false, item: 'IR.pdf', error: refused }, { ok: true, item: 'c.pdf', value: 1 }];
    expect(refusedLine(two, name, 'moved')).toBe('2 files not moved: A signed record stays on file.');
    expect(refusedLine([{ ok: true, item: 'c.pdf', value: 1 }], name, 'moved')).toBeNull();
  });
});
