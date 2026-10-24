import { describe, expect, it } from 'vitest';
import type { QuickPhrase } from '../../data/phrases.types';
import { insertPhrase, nameFrom, shownFor } from './phraseText';

const phrase = (id: string, context: QuickPhrase['context']): QuickPhrase => ({
  id, version: 1, context, label: id, body: id, sort: 0, deleted_at: null,
});

describe('quick phrases on a note', () => {
  it('shows the box\'s own phrases and the ones for every box, in order', () => {
    const all = [phrase('a', 'any'), phrase('b', 'gc_return'), phrase('c', 'ir_result')];
    expect(shownFor(all, 'ir_result').map((p) => p.id)).toEqual(['a', 'c']);
    expect(shownFor(all, 'correction').map((p) => p.id)).toEqual(['a']);
  });

  it('names a phrase by its first words, within 40 characters', () => {
    expect(nameFrom('  Missing firecaulk at the head of wall. ')).toBe('Missing firecaulk at the');
    expect(nameFrom('Supercalifragilisticexpialidocious-and-then-some-more-letters here')).toBe('Supercalifragilisticexpialidocious-and-t');
    expect(nameFrom('OK')).toBe('OK');
  });

  it('adds on a new line at the end when the box has no cursor', () => {
    expect(insertPhrase('', 'OK to cover.', null, true, 500)).toEqual({ text: 'OK to cover.', caret: 12 });
    expect(insertPhrase('Level 2.  \n', 'OK to cover.', null, true, 500).text).toBe('Level 2.\nOK to cover.');
    expect(insertPhrase('Level 2.', 'OK.', null, false, 500).text).toBe('Level 2. OK.');
  });

  it('goes in at the cursor, spaced from the words around it', () => {
    expect(insertPhrase('Grid A, grid B', 'passed', { start: 6, end: 6 }, true, 500)).toEqual({ text: 'Grid A passed, grid B', caret: 13 });
    expect(insertPhrase('Grid A failed', 'passed', { start: 7, end: 13 }, true, 500)).toEqual({ text: 'Grid A passed', caret: 13 });
    expect(insertPhrase('ab', 'X', { start: 1, end: 1 }, true, 500).text).toBe('a X b');
  });

  it('never makes the note longer than its box takes', () => {
    expect(insertPhrase('12345', 'abcdef', null, false, 8)).toEqual({ text: '12345 ab', caret: 8 });
  });
});
