// An OFS request's map PDF, downloaded (Revs, 0056): the ir-map function's `download` action makes the map first when
// it is out of date, then answers a fresh signed URL with the original filename ("IR 377 Map <job> 10-05-2026.pdf"),
// logged like any download; lib/saveFile saves it in one click. The map PDF is server-only: not in the e2e mock.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { saveFile } from '../lib/saveFile';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';

const mapFileSchema = z.object({ file_id: z.string(), url: z.string().url(), filename: z.string().min(1) });

export function useDownloadIrMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string): Promise<void> => {
      if (isMock()) throw new Error('Downloads are not available in the e2e mock.');
      const res = await callFunction('ir-map', { action: 'download', request_id: requestId }, mapFileSchema);
      await saveFile(res.url, res.filename);
    },
    // A download that had to make the map first leaves it current.
    onSettled: (_r, _e, requestId) => qc.invalidateQueries({ queryKey: qk.irMap(requestId) }),
  });
}
