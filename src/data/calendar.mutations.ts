// Calendar writes (SPEC §7.6). Manual lines only (calendar.manage, checked by RLS). Saves carry the version check;
// delete sets deleted_at and Undo clears it, both checked against the version. Every write refreshes the qk.calendar
// prefix once.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { flattenLine, LINE_COLS } from './calendar.queries';
import type { CalendarLine, CalendarLineFields } from './calendar.types';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { functionUrl } from './functions';
import { qk } from './keys';
import * as mock from './mock/calendar';
import { isMock } from './mock';

function useRefreshCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.calendar });
}

export function useAddCalendarLine() {
  const refresh = useRefreshCalendar();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; fields: CalendarLineFields }): Promise<CalendarLine> => {
      if (isMock()) return mock.add(v.projectId, v.fields);
      const job: unknown = throwIfError(await supabase.from('projects').select('org_id').eq('id', v.projectId).single());
      const { org_id } = z.object({ org_id: z.string() }).parse(job);
      const row = throwIfError(
        await supabase
          .from('calendar_entries')
          .insert({ ...v.fields, org_id, project_id: v.projectId, created_by: user.id })
          .select(LINE_COLS)
          .single(),
      );
      return flattenLine(row);
    },
    onSettled: refresh,
  });
}

/** Any change to one line, against the version it was read at. 0 rows = someone changed it first. */
async function patchLine(id: string, version: number, patch: Partial<CalendarLineFields> & { deleted_at?: string | null }): Promise<CalendarLine> {
  if (isMock()) {
    const { deleted_at, ...fields } = patch;
    return mock.change(id, version, deleted_at === undefined ? fields : { ...fields, deleted: deleted_at !== null });
  }
  const rows = throwIfError(await supabase.from('calendar_entries').update(patch).eq('id', id).eq('version', version).select(LINE_COLS));
  const row = rows[0];
  if (!row) throw conflictError();
  return flattenLine(row);
}

export function useSaveCalendarLine() {
  const refresh = useRefreshCalendar();
  return useMutation({
    mutationFn: (v: { line: CalendarLine; fields: CalendarLineFields }) => patchLine(v.line.id, v.line.version, v.fields),
    onSettled: refresh,
  });
}

/** Delete = set deleted_at. Returns the line at its new version, which Undo needs. */
export function useDeleteCalendarLine() {
  const refresh = useRefreshCalendar();
  return useMutation({
    mutationFn: (line: CalendarLine) => patchLine(line.id, line.version, { deleted_at: new Date().toISOString() }),
    // Not awaited: the open line closes at once instead of first reloading as "gone".
    onSettled: () => {
      void refresh();
    },
  });
}

/** Undo of a delete: clears deleted_at at the version the delete left. */
export function useRestoreCalendarLine() {
  const refresh = useRefreshCalendar();
  return useMutation({
    mutationFn: (line: CalendarLine) => patchLine(line.id, line.version, { deleted_at: null }),
    onSettled: refresh,
  });
}

/**
 * Makes my feed link, or replaces it ("New link"; the old link stops working). Returns the link to subscribe to.
 * The token in it is shown this once: only its sha256 is kept.
 */
export function useRotateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const token = isMock() ? await mock.rotateFeed() : z.string().min(1).parse(throwIfError(await supabase.rpc('rotate_calendar_feed')));
      return `${functionUrl('calendar-feed')}?t=${encodeURIComponent(token)}`;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.calendarFeed }),
  });
}
