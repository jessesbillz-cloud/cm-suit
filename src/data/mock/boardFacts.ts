// The board's request lookup (data/board.queries) in the mock: the requests among `ids` the signed-in mock user may
// read, as RLS answers them.
import type { BoardRequestRow } from '../board.queries';
import { mockUser } from './index';
import { everyRequest } from './inspections';
import { maySee } from './irRules';
import { delay } from './store';

export async function boardRequests(ids: readonly string[]): Promise<BoardRequestRow[]> {
  await delay();
  const me = mockUser().id;
  return everyRequest()
    .filter((r) => ids.includes(r.id) && maySee(me, r))
    .map((r) => ({ id: r.id, kind: r.kind, result: r.result, mdr_id: r.mdr_id }));
}
