/// <reference types="node" />
// Anon probe, Schedule (migration 0062): every Schedule RPC is refused with no session (the member RPCs, the reads, the
// reminder data and the internal helpers). Kept here: anon-probe.ts is at its line limit; _lib.ts re-exports it.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const SCHEDULE_RPCS: [string, Record<string, unknown>][] = [
  ['schedule_folder', { p_project_id: ZERO_UUID }],
  ['schedule_import_draft', {
    p_project_id: ZERO_UUID, p_file_id: ZERO_UUID, p_source_kind: 'csv', p_title: null, p_data_date: null, p_content_hash: null,
    p_model: null, p_warnings: [], p_rows: [{ name: 'probe' }],
  }],
  ['schedule_draft_save', { p_version_id: ZERO_UUID, p_version: 1, p_title: 'probe', p_data_date: null }],
  ['schedule_activity_save', {
    p_activity_id: ZERO_UUID, p_version: 1, p_code: '', p_name: 'probe', p_wbs: '', p_area: '', p_trade: '', p_start: null, p_finish: null,
    p_is_milestone: false,
  }],
  ['schedule_activity_remove', { p_activity_id: ZERO_UUID, p_removed: true }],
  ['schedule_discard', { p_version_id: ZERO_UUID, p_discarded: true }],
  ['schedule_publish', { p_version_id: ZERO_UUID, p_version: 1 }],
  ['schedule_unpublish', { p_version_id: ZERO_UUID }],
  ['schedule_versions_list', { p_project_id: ZERO_UUID }],
  ['schedule_version', { p_version_id: ZERO_UUID }],
  ['schedule_current', { p_project_id: ZERO_UUID }],
  ['schedule_status', { p_project_id: ZERO_UUID }],
  ['schedule_upcoming', { p_project_id: ZERO_UUID, p_days: 60 }],
  ['schedule_today', { p_project_id: ZERO_UUID }],
  ['schedule_daily', {}],
  ['schedule_folder_make', { p_project_id: ZERO_UUID }],
  ['schedule_calendar_sync', { p_project_id: ZERO_UUID }],
  ['schedule_version_lock', { p_version_id: ZERO_UUID }],
  ['schedule_draft_lock', { p_version_id: ZERO_UUID }],
  ['schedule_lines_ok', { p_lines: [], p_max: 1 }],
  ['schedule_text', { p: 'probe' }],
];
