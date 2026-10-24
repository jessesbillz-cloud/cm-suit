// What the board needs beside its lines to color them and say who (Jesse, Oct 23): each line's inspection request as
// I may read it (OFS or not, its result, copied from MDR), and the names of the people who wrote the lines. Both read
// through the queries the rest of the app uses (RLS decides; a request I may not read just isn't in the answer). The
// request lookups sit under the board's key, so whatever refreshes the board refreshes them.
import { useQueries } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import * as mockFacts from './mock/boardFacts';
import { isMock } from './mock';
import { peopleQuery } from './queries';
import type { Tables } from './database.types';
import type { BoardLine } from './types';

/** What a line's inspection request says. */
export interface RequestFacts {
  ofs: boolean;
  result: string | null;
  fromMdr: boolean;
}

export type BoardRequestRow = Pick<Tables<'inspection_requests'>, 'id' | 'kind' | 'result' | 'mdr_id'>;

/** One lookup per this many requests (a board page). */
const CHUNK = 50;

async function fetchRequests(ids: readonly string[]): Promise<BoardRequestRow[]> {
  if (isMock()) return mockFacts.boardRequests(ids);
  return throwIfError(await supabase.from('inspection_requests').select('id, kind, result, mdr_id').in('id', [...ids]));
}

function chunks(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
  return out;
}

interface BoardFacts {
  requests: ReadonlyMap<string, RequestFacts>;
  /** user id -> full name. */
  names: ReadonlyMap<string, string>;
  error: Error | null;
  retry: () => void;
}

export function useBoardFacts(projectId: string | null, lines: readonly BoardLine[]): BoardFacts {
  const ids = [...new Set(lines.filter((l) => l.entity_type === 'inspection_request' && l.entity_id !== '').map((l) => l.entity_id))];
  const jobs = [...new Set(lines.map((l) => l.project_id))];
  const requests = useQueries({
    queries: chunks(ids).map((part) => ({
      queryKey: [...qk.board(projectId), 'requests', part] as const,
      queryFn: () => fetchRequests(part),
    })),
  });
  const people = useQueries({ queries: jobs.map((id) => peopleQuery(id)) });

  const facts = new Map<string, RequestFacts>();
  for (const q of requests) {
    for (const r of q.data ?? []) facts.set(r.id, { ofs: r.kind === 'ofs', result: r.result, fromMdr: r.mdr_id !== null });
  }
  const names = new Map<string, string>();
  for (const q of people) {
    for (const p of q.data ?? []) if (p.user_id !== null) names.set(p.user_id, p.full_name);
  }
  const failed = [...requests, ...people].filter((q) => q.isError);
  return {
    requests: facts,
    names,
    error: failed[0]?.error ?? null,
    retry: () => {
      for (const q of failed) void q.refetch();
    },
  };
}
