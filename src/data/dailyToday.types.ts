// Today's report on each of my jobs (0045 my_daily_today, SPEC §13.1): one row per job where I write dailies, with my
// chosen form there, the job's today (its own zone), whether today is scheduled, and today's report on that form.
// Pinned with zod at the boundary (the generated types can't say which columns may be null).
import { z } from 'zod';

export const dailyTodaySchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  report_type: z.string(),
  /** The setup's label; null when it has none (the database never invents one). */
  label: z.string().nullable(),
  /** 0 = Sunday .. 6 = Saturday. */
  schedule_days: z.array(z.number().int()),
  /** yyyy-MM-dd in the job's zone. */
  today: z.string(),
  scheduled_today: z.boolean(),
  report_id: z.string().nullable(),
  status: z.enum(['none', 'draft', 'submitted']),
  /** Today's report's own number, once signed. */
  number: z.number().int().nullable(),
  /** The number the next report on the form gets, while today's has none. */
  next_number: z.number().int().nullable(),
  /** Today's report's version (1 = untouched), or null with none: Start / Continue like the Dailies button. */
  report_version: z.number().int().nullable(),
});

export type DailyTodayRow = z.infer<typeof dailyTodaySchema>;
