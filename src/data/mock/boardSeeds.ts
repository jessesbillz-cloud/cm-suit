// Synthetic field records on Sample Job B that the mock board's lines point at: an IR with its result, a correction
// with a photo, and a submitted daily report with its PDF (by someone else). Each module's mock starts from these, so
// an opened board line and the tool it opens in show the same record. Obviously fake (CLAUDE.md rule 8).
import { DAILY_REPORT_TYPE } from '../../lib/dailies';
import type { CorrectionRow } from '../corrections.types';
import type { DailyReportRow } from '../dailies.types';
import type { IrRowRaw } from '../inspections.types';
import type { FileRow } from '../types';

const JOB = 'job-b';
const DAY = '2026-09-25';
const SOMEONE = 'mock-someone';
const INSPECTOR = 'mock-user-inspector';

export const SEED_IR_ID = 'mock-ir-job-b-12';
export const SEED_CN_ID = 'cn-job-b-4';
export const SEED_DAILY_ID = 'mock-daily-job-b-7';
/** RFI 002 on Sample Job A: answered, impact claimed (the RFI mock seeds it; a board line points at it). */
export const SEED_RFI_ID = 'mock-rfi-job-a-2';

const PHOTO_ID = 'job-b-photo-1';
const DAILY_PDF_ID = 'job-b-daily-7';

function file(id: string, folder: string, name: string, mime: string, size: number, at: string): FileRow {
  return {
    id,
    project_id: JOB,
    folder_id: `${JOB}-${folder}`,
    original_name: name,
    mime,
    size,
    scan_status: 'clean',
    upload_complete: true,
    created_at: at,
    created_by: SOMEONE,
  };
}

export const SEED_FILES: FileRow[] = [
  file(PHOTO_ID, 'photos', 'Sample corridor photo.jpg', 'image/jpeg', 812_400, '2026-09-25T17:20:00Z'),
  file(DAILY_PDF_ID, 'reports', 'Sample Daily Report 7.pdf', 'application/pdf', 96_512, '2026-09-25T23:30:00Z'),
];

/** IR 12: a special concrete inspection, approved; the next request on the job is 13. */
export const SEED_IR: IrRowRaw = {
  id: SEED_IR_ID, project_id: JOB, org_id: 'org-sample', number: 12, version: 4, requested_by: SOMEONE, created_by: SOMEONE,
  created_at: '2026-09-23T16:00:00Z', updated_at: '2026-09-25T19:00:00Z', deleted_at: null, company: 'Sample Concrete Co',
  request_date: DAY, start_time: '08:00', duration_kind: 'timed', duration_min: 60, kind: 'special',
  special_kind_id: 'kind-concrete', items: 'Sample footings, grid lines A to C', attachment_ids: [],
  notice_ack_at: '2026-09-23T16:00:00Z', status: 'complete', gc_by: null, gc_at: null, gc_note: null, owner_id: INSPECTOR,
  helper_id: null, confirm_note: null, attendance: null, result: 'approved', result_note: 'Sample placement observed.',
  result_photo_ids: [], result_at: '2026-09-25T18:30:00Z', result_by: INSPECTOR, helper_report: null, helper_note: null,
  helper_at: null, postpone_reason: null, postpone_note: null, postpone_until: null, postponed_at: null, postpone_count: 0,
  ir_file_id: 'job-b-ir-12', content_hash: null, signed_at: '2026-09-25T19:00:00Z', signed_by: INSPECTOR, pdf_stale: false,
  pdf_postponed: false, results_sent_at: null, summary: null, permit_id: null,
  requester_name: null, requester_phone: null, requester_email: null,
};

/** CN-004: open, with one photo; the next correction on the job is CN-005. */
export const SEED_CORRECTION: CorrectionRow & { request_key: string; deleted: boolean } = {
  id: SEED_CN_ID,
  project_id: JOB,
  number: 4,
  title: 'Sample missing firestop at corridor penetrations',
  description: 'Sample pipe penetrations at the level 2 corridor wall are not sealed.',
  photo_ids: [PHOTO_ID],
  status: 'open',
  trade: 'Sample Firestopping',
  location: 'Level 2 corridor',
  spec_tags: [],
  notice_file_id: null,
  notice_ref: '',
  created_by: INSPECTOR,
  created_at: '2026-09-25T17:30:00Z',
  closed_at: null,
  version: 1,
  request_key: 'seed-cn-4',
  deleted: false,
};

/** Daily report #7, submitted by someone else, with its signed PDF. */
export const SEED_DAILY: DailyReportRow = {
  id: SEED_DAILY_ID,
  project_id: JOB,
  author_id: SOMEONE,
  report_type: DAILY_REPORT_TYPE,
  report_date: DAY,
  status: 'submitted',
  number: 7,
  header: {
    project_name: 'Sample Job B',
    project_number: 'S-200',
    author_name: 'Sample Inspector',
    author_company: 'Sample Inspection',
    label: 'Daily report',
    timezone: 'America/Los_Angeles',
  },
  content: {},
  version: 3,
  signed_at: '2026-09-25T23:30:00Z',
  signed_version: 3,
  hours: null,
  submitted_at: '2026-09-25T23:30:00Z',
  pdf_file_id: DAILY_PDF_ID,
  filename: 'Sample Daily Report 7.pdf',
};
