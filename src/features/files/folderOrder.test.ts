import { describe, expect, it } from 'vitest';
import { folderDescendants, folderLabel, folderPath } from './folderOrder';

type F = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  sort: number;
  file_count: number | null;
  person: string | null;
};

function folder(id: string, name: string, sort: number, extra: Partial<F> = {}): F {
  return { id, parent_id: null, name, kind: 'general', sort, file_count: null, person: null, ...extra };
}

describe("an author's folder", () => {
  it('is named by the person in its path', () => {
    const list = [
      folder('reports', 'Reports', 50, { kind: 'reports', file_count: 1 }),
      folder('z', 'probe_handle', 100, { parent_id: 'reports', person: 'Ada Author', file_count: 2 }),
    ];
    expect(folderLabel(list[1] as F)).toBe('Ada Author');
    expect(folderPath(list, 'z')).toBe('Reports / Ada Author');
  });
});

describe('folder path', () => {
  it('names the folder from the top of the tree down', () => {
    const list = [
      folder('reports', 'Reports', 50),
      folder('a', 'A author', 100, { parent_id: 'reports' }),
      folder('orphan', 'Shared with me', 100, { parent_id: 'not-visible' }),
    ];
    expect(folderPath(list, 'a')).toBe('Reports / A author');
    expect(folderPath(list, 'reports')).toBe('Reports');
    expect(folderPath(list, 'orphan')).toBe('Shared with me');
    expect(folderPath(list, 'missing')).toBe('');
  });
});

describe('folderDescendants', () => {
  it('lists the folders inside one at any depth, not itself or its neighbours', () => {
    const list = [
      folder('a', 'Submittals', 1),
      folder('b', '03 Concrete', 1, { parent_id: 'a' }),
      folder('c', 'Rebar', 1, { parent_id: 'b' }),
      folder('d', 'Plans', 2),
    ];
    expect([...folderDescendants(list, 'a')].sort()).toEqual(['b', 'c']);
    expect(folderDescendants(list, 'd').size).toBe(0);
  });
});
