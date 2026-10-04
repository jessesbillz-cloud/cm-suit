// Calendar shapes the app reads and writes (SPEC §7.6). Rows derive from the generated types; the inspections RPC's
// answer (typed non-null by the generator) is parsed with zod at the boundary.
import { z } from 'zod';
import type { Tables } from './database.types';
import { calendarRowSchema } from './inspections.types';

/** One line of calendar_inspections (0043, 0061): the calendar row plus the request's attachments and postponements. */
export const calendarInspectionSchema = calendarRowSchema.extend({
  attachment_ids: z.array(z.string()),
  postpone_count: z.number(),
});

/** An inspection line of one job on the month calendar. */
export type CalendarInspection = z.infer<typeof calendarInspectionSchema> & { project_id: string };

type CalendarEntryRow = Pick<
  Tables<'calendar_entries'>,
  | 'id'
  | 'project_id'
  | 'kind'
  | 'source_type'
  | 'source_id'
  | 'title'
  | 'location'
  | 'starts_at'
  | 'ends_at'
  | 'all_day'
  | 'status'
  | 'version'
>;

/** A line with its job's name and time zone: days and times are shown in the job's zone. */
export type CalendarLine = CalendarEntryRow & { project_name: string; timezone: string };

/** A time range of lines to load: [from, to) as UTC ISO strings. */
export interface CalendarRange {
  from: string;
  to: string;
}

/** What a person types for a manual line; instants already converted to UTC in the job's zone. */
export interface CalendarLineFields {
  kind: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

/** My feed link: only when it was last made. The token itself is shown once, when it is made. */
export type CalendarFeedState = Pick<Tables<'calendar_feed_tokens'>, 'rotated_at'> | null;
