/// <reference types="node" />
// Anon probe, OFS requests and permits to OSFM's meaning (migration 0061): the new RPCs (sending an OFS request to OFS
// and its Undo, a review's backcheck) and the internal helpers (who decides a request, who may see it, where it starts)
// are refused with no session. Kept here: anon-probe.ts is at its line limit, and it imports these through _lib.ts
// (which re-exports them), so this file imports nothing from _lib (no import cycle).
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** The 0061 RPCs for the anon probe: the member RPCs and the internal helpers. */
export const OFS_PERMITS_RPCS: [string, Record<string, unknown>][] = [
  // The OFS route (SPEC §18.4 P1): sub -> GC -> inspector -> OFS.
  ['ir_send_ofs', { p_request_id: ZERO_UUID, p_version: 1 }],
  ['ir_unsend_ofs', { p_request_id: ZERO_UUID, p_version: 1 }],
  ['ir_may_see', { p_project_id: ZERO_UUID, p_requested_by: ZERO_UUID, p_kind: 'ofs', p_ofs_sent_at: '2030-01-01T00:00:00Z' }],
  ['ir_decide_cap', { p_kind: 'ofs', p_ofs_sent_at: '2030-01-01T00:00:00Z' }],
  ['ir_owner_ok', { p_project_id: ZERO_UUID, p_owner: ZERO_UUID, p_kind: 'ofs', p_ofs_sent_at: '2030-01-01T00:00:00Z' }],
  ['ir_first_status', { p_project_id: ZERO_UUID, p_kind: 'ofs' }],
  ['ir_member_holds', { p_project_id: ZERO_UUID, p_member: ZERO_UUID, p_cap: 'ir.ofs_decide' }],
  ['ir_tell_ofs', { p_request_id: ZERO_UUID }],
  // Permits.
  ['permit_review_backcheck', { p_review_id: ZERO_UUID }],
  ['ir_ofs_permit', { p_list_id: ZERO_UUID }],
  ['permit_stage_ok', { p_stage: 'issued' }],
  ['permit_kind_ok', { p_kind: 'building' }],
  ['permit_review_kind_ok', { p_kind: 'initial' }],
  ['permit_review_label', { p_review_no: 1, p_backcheck: 0 }],
  ['permit_open_inspections', { p_permit_id: ZERO_UUID }],
  ['permit_expiry_touch', { p_permit_id: ZERO_UUID }],
];
