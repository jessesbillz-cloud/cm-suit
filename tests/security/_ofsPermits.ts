/// <reference types="node" />
// Anon probe, OFS requests and permits to OSFM's meaning (migration 0061): the new RPC (a review's backcheck) and the
// internal helpers are refused with no session. Kept here: anon-probe.ts is at its line limit, and it imports these
// through _lib.ts (which re-exports them), so this file imports nothing from _lib (no import cycle).
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const READY = { previous: 'yes', trade: 'yes', gc: 'yes', ior: 'yes', special: 'na' };

/** The 0061 RPCs for the anon probe: the member RPC and the internal helpers. */
export const OFS_PERMITS_RPCS: [string, Record<string, unknown>][] = [
  ['permit_review_backcheck', { p_review_id: ZERO_UUID }],
  ['ir_readiness_ok', { p_readiness: READY }],
  ['ir_readiness_for', { p_kind: 'ofs', p_readiness: READY }],
  ['ir_ofs_permit', { p_list_id: ZERO_UUID }],
  ['permit_stage_ok', { p_stage: 'issued' }],
  ['permit_kind_ok', { p_kind: 'building' }],
  ['permit_review_kind_ok', { p_kind: 'initial' }],
  ['permit_review_label', { p_review_no: 1, p_backcheck: 0 }],
  ['permit_open_inspections', { p_permit_id: ZERO_UUID }],
  ['permit_expiry_touch', { p_permit_id: ZERO_UUID }],
];
