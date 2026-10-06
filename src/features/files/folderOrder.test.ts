import { describe, expect, it } from 'vitest';
import { defaultFolderId, folderLabel, folderPath, treeOrder, visibleFolders } from './folderOrder';

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

describe('folder tree order', () => {
  it('lists by sort, then name, so the most used folders come first and photos after them', () => {
    const list = [
      folder('photos', 'Photos', 60, { kind: 'photos' }),
      folder('mine', 'Anything', 100),
      folder('specs', 'Specs', 20, { kind: 'specs' }),
      folder('ti', 'Testing & inspections', 30, { kind: 'ti' }),
      folder('dsa', 'DSA 103', 30, { kind: 'dsa_103' }),
      folder('plans', 'Plans', 10, { kind: 'plans' }),
    ];
    expect(treeOrder(list).map((n) => n.folder.id)).toEqual(['plans', 'specs', 'dsa', 'ti', 'photos', 'mine']);
    expect(defaultFolderId(list)).toBe('plans');
  });

  it('puts children under their parent, one level deeper, and orphans at the top', () => {
    const list = [
      folder('reports', 'Reports', 50),
      folder('b', 'B author', 100, { parent_id: 'reports' }),
      folder('a', 'A author', 100, { parent_id: 'reports' }),
      folder('orphan', 'Shared with me', 100, { parent_id: 'not-visible' }),
      folder('plans', 'Plans', 10),
    ];
    expect(treeOrder(list).map((n) => [n.folder.id, n.depth])).toEqual([
      ['plans', 0],
      ['reports', 0],
      ['a', 1],
      ['b', 1],
      ['orphan', 0],
    ]);
  });

  it('hides "Emailed in" while it is empty, and shows it once something arrives', () => {
    const empty = [folder('plans', 'Plans', 10), folder('in', 'Emailed in', 900, { kind: 'inbound', file_count: 0 })];
    expect(visibleFolders(empty).map((f) => f.id)).toEqual(['plans']);
    const full = [folder('plans', 'Plans', 10), folder('in', 'Emailed in', 900, { kind: 'inbound', file_count: 2 })];
    expect(visibleFolders(full).map((f) => f.id)).toEqual(['plans', 'in']);
  });

  it('keeps an empty "Emailed in" that has subfolders, and never hides other empty folders', () => {
    const list = [
      folder('in', 'Emailed in', 900, { kind: 'inbound', file_count: 0 }),
      folder('sorted', 'Sorted', 100, { parent_id: 'in' }),
      folder('photos', 'Photos', 60, { kind: 'photos' }),
    ];
    expect(visibleFolders(list).map((f) => f.id)).toEqual(['in', 'sorted', 'photos']);
  });

  it("hides the app's folders while empty, even inside one another, and keeps Plans, Photos and people's folders", () => {
    const list = [
      folder('plans', 'Plans', 10, { kind: 'plans' }),
      folder('reports', 'Reports', 50, { kind: 'reports', file_count: 0 }),
      folder('ir', 'Inspection reports', 100, { kind: 'reports', parent_id: 'reports', file_count: 0 }),
      folder('ofs', 'OFS inspection reports', 100, { kind: 'reports', parent_id: 'reports', file_count: 0 }),
      folder('photos', 'Photos', 60, { kind: 'photos' }),
      folder('corr', 'Corrections', 100, { kind: 'photos', parent_id: 'photos', file_count: 0 }),
      folder('mine', 'Sample submittals', 100),
    ];
    expect(visibleFolders(list).map((f) => f.id)).toEqual(['plans', 'photos', 'mine']);
    const filed = list.map((f) => (f.id === 'ofs' ? { ...f, file_count: 1 } : f));
    expect(visibleFolders(filed).map((f) => f.id)).toEqual(['plans', 'reports', 'ofs', 'photos', 'mine']);
  });

  it("names an author's folder by the person, in the tree order and the path", () => {
    const list = [
      folder('reports', 'Reports', 50, { kind: 'reports', file_count: 1 }),
      folder('z', 'probe_handle', 100, { parent_id: 'reports', person: 'Ada Author', file_count: 2 }),
      folder('b', 'Bea Builder', 100, { parent_id: 'reports', person: 'Bea Builder', file_count: 1 }),
    ];
    expect(treeOrder(list).map((n) => folderLabel(n.folder))).toEqual(['Reports', 'Ada Author', 'Bea Builder']);
    expect(folderPath(list, 'z')).toBe('Reports / Ada Author');
  });

  it('opens on nothing when there are no folders to show', () => {
    expect(defaultFolderId([folder('in', 'Emailed in', 900, { kind: 'inbound', file_count: 0 })])).toBeNull();
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
