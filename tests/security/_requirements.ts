/// <reference types="node" />
// Anon probe, Requirements (migration 0063): every Requirements RPC is refused with no session (the member RPCs, the
// reminder and the internal helpers). Kept here: anon-probe.ts is at its line limit, and it imports this list through
// _lib.ts (which re-exports it), so this file imports nothing from _lib at run time.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const REQUIREMENTS_RPCS: [string, Record<string, unknown>][] = [
  ['requirements_folder', { p_project_id: ZERO_UUID }],
  ['requirements_list', { p_project_id: ZERO_UUID }],
  ['requirements_spec_sections', { p_project_id: ZERO_UUID }],
  ['requirement_save', {
    p_project_id: ZERO_UUID, p_id: null, p_version: null, p_key: ZERO_UUID, p_kind: 'other', p_title: 'probe', p_details: '',
    p_spec_section: '', p_spec_title: '', p_spec_ref: '', p_responsible: '', p_required: 'yes', p_notice_days: null,
    p_lead_days: null, p_activity_code: '', p_activity_name: '', p_trigger_date: null,
  }],
  ['requirement_set_status', { p_id: ZERO_UUID, p_version: 1, p_status: 'done' }],
  ['requirement_evidence', { p_id: ZERO_UUID, p_version: 1, p_note: 'probe', p_file_id: null }],
  ['requirement_keep', { p_id: ZERO_UUID, p_version: 1, p_keep: true }],
  ['requirement_remove', { p_id: ZERO_UUID, p_removed: true }],
  ['requirements_add_drafts', { p_project_id: ZERO_UUID, p_model: 'probe', p_source_file_id: null, p_drafts: [] }],
  ['requirements_check', {}],
  ['requirements_folder_make', { p_project_id: ZERO_UUID }],
  ['requirement_kind_ok', { p_kind: 'ofci' }],
  ['requirement_section', { p_text: '102800' }],
  ['requirement_lock', { p_id: ZERO_UUID }],
  ['requirement_file_ok', { p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['requirement_tasks_done', { p_id: ZERO_UUID }],
  ['requirement_rearm', { p_id: ZERO_UUID }],
  ['requirement_reminder_line', { p_kind: 'ofci', p_title: 'probe', p_due: '2030-01-01', p_today: '2030-01-01' }],
];
