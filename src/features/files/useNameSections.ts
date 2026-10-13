// Files already on the job get their hidden spec section (0105) once: when a section's list opens, the files on it that
// I may change, with none yet and a section in their names, are filled from the names (sectionOfName). No PDF is read
// in bulk. The database skips anything that is not mine to change.
import { useEffect, useRef } from 'react';
import { messageOf } from '../../data/errors';
import { useFillFileSections } from '../../data/fileSection';
import type { FileRow } from '../../data/types';
import { useToast } from '../../ui/Toast';
import { sectionKey, sectionOfName } from '../specs/sections';

/** "id:092900 id:054000": the files to fill, as one value the effect can watch. */
function wanted(files: readonly FileRow[], mine: ReadonlyMap<string, number>): string {
  return files
    .flatMap((f) => {
      if (!mine.has(f.id) || f.spec_section != null) return [];
      const key = sectionKey(sectionOfName(f.original_name) ?? '');
      return key === null ? [] : [`${f.id}:${key}`];
    })
    .join(' ');
}

export function useNameSections(projectId: string, files: readonly FileRow[], mine: ReadonlyMap<string, number>) {
  const { mutate } = useFillFileSections(projectId);
  const toast = useToast();
  // Sent from this list already: each file is asked once while it is open.
  const sent = useRef(new Set<string>());
  const want = wanted(files, mine);
  useEffect(() => {
    const items = want.split(' ').flatMap((pair) => {
      const [fileId, section] = pair.split(':');
      return fileId && section && !sent.current.has(fileId) ? [{ fileId, section }] : [];
    });
    if (items.length === 0) return;
    for (const it of items) sent.current.add(it.fileId);
    mutate(items, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Spec sections not saved: ${messageOf(e)}` });
      },
    });
  }, [want, mutate, toast]);
}
