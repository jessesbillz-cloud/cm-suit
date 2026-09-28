// The CSI MasterFormat reference (0033). It only changes with a migration, so one read per session is enough.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import type { CsiLibrary } from './csi.types';
import { throwIfError } from './errors';
import { qk } from './keys';
import * as mockCsi from './mock/csi';
import { isMock } from './mock';

async function readLibrary(): Promise<CsiLibrary> {
  const [divisions, sections] = await Promise.all([
    supabase.from('csi_divisions').select('number, title, reserved').order('number'),
    supabase.from('csi_sections').select('number, division, level, title').order('number'),
  ]);
  return { divisions: throwIfError(divisions), sections: throwIfError(sections) };
}

export function useCsiLibrary() {
  return useQuery({
    queryKey: qk.csi,
    queryFn: (): Promise<CsiLibrary> => (isMock() ? mockCsi.library() : readLibrary()),
    staleTime: Infinity,
  });
}
