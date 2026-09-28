// Daily reports: the ONE content schema, setup settings schema (defaults) and shared rules live with the edge functions
// (supabase/functions/_shared/dailies.ts) so the browser and the server read a report the same way.
export {
  DAILY_REPORT_TYPE,
  DAILY_SETTINGS_DEFAULTS,
  NOTE_SECTIONS,
  asPdfName,
  dailyContentSchema,
  dailyFilenameFields,
  dailyHeaderSchema,
  dailySettingsSchema,
  needsResubmit,
  parseDailySettings,
  type DailyContent,
  type DailyHeader,
  type DailySettings,
  type NoteKey,
  type WorkRow,
} from '../../supabase/functions/_shared/dailies';
