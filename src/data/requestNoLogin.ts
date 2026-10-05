// Inspection requests from the request link with no login (SPEC §6.4 #4, migrations 0055 and 0057). No session:
// everything goes through the public request-link function, which answers the outsider's day (time, length, type,
// color), takes the request (or the revs request, naming its walls and items) with its photos / PDFs as one multipart
// form, and answers a request's status by its private receipt (live: every 30 s, like MDR's contractor view) and its
// IR PDF once made (0075). The walls and a request's map: requestNoLoginRevs.ts.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callFunction } from './functions';
import type { CalendarRow } from './inspections.types';
import { prepareIrFile } from './inspections.mutations';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requestNoLogin';
import * as mockRevs from './mock/requestNoLoginRevs';
import type { LinkKey } from './requestLink.types';
import {
  publicDaySchema,
  publicIrSchema,
  requestFactsSchema,
  submittedSchema,
  type PublicDay,
  type PublicIr,
  type PublicOfsInput,
  type PublicRequestInput,
  type RequestFacts,
  type Submitted,
} from './requestNoLogin.types';

export function linkBody(key: LinkKey) {
  return { project_id: key.projectId, token: key.token, ...(key.hubId === null ? {} : { hub_id: key.hubId }) };
}

interface OutsiderRow {
  start_time: string | null;
  duration_kind: string;
  duration_min: number | null;
  kind: string;
  status_key: string;
}

/** An outsider's line as the app's calendar row: no id, number, company or items (the day list is one component). */
function asCalendarRow(r: OutsiderRow, day: string): CalendarRow {
  return {
    id: null, number: null, version: null, full_detail: false, mine: false, is_block: r.kind === 'block', request_date: day,
    start_time: r.start_time, duration_kind: r.duration_kind, duration_min: r.duration_min, kind: r.kind, special_kind: null,
    status: r.status_key, status_key: r.status_key, result: null, attendance: null, company: null, items: null, owner_id: null,
    helper_id: null, postpone_reason: null, postpone_until: null, ofs_sent: false,
  };
}

async function fetchDay(key: LinkKey, day: string | null): Promise<PublicDay> {
  const raw = isMock()
    ? await mock.day(key, day)
    : await callFunction('request-link', { action: 'calendar', ...linkBody(key), ...(day === null ? {} : { day }) }, publicDaySchema);
  return { ...raw, rows: raw.rows.map((r) => asCalendarRow(r, raw.day)) };
}

/** The job's request day for anyone with the link (null = the job's today), and the form's choices. A dead link
 *  rejects with FunctionError 404. Live while on screen, like the app's calendar. */
export function usePublicDay(key: LinkKey, day: string | null) {
  return useQuery({
    queryKey: qk.requestLinkDay(key.projectId, key.hubId ?? 'job', day ?? ''),
    queryFn: () => fetchDay(key, day),
    retry: false,
    refetchInterval: 60_000,
    // Changing the day keeps the last day's rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

/** Who is asking and when: what every request from the link carries. */
function visitorPayload(key: LinkKey, v: PublicRequestInput | PublicOfsInput) {
  return {
    action: 'submit',
    ...linkBody(key),
    name: v.contact.name.trim(),
    company: v.contact.company.trim(),
    phone: v.contact.phone.trim(),
    email: v.contact.email.trim(),
    date: v.date,
    time: v.startTime,
    duration_kind: v.durationKind,
    duration_min: v.durationMin,
    notice_ack: true,
  };
}

/** The multipart form: the JSON payload and the files (photos compressed on the way). */
async function formOf(payload: object, files: File[]): Promise<FormData> {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const picked of files) {
    const file = await prepareIrFile(picked);
    form.append('file', file, file.name);
  }
  return form;
}

async function send(key: LinkKey, v: PublicRequestInput): Promise<Submitted> {
  if (isMock()) return mock.submit(key, v);
  const payload = {
    ...visitorPayload(key, v),
    kind: v.kind,
    special_kind_id: v.kind === 'special' ? v.specialKindId : null,
    items: v.items.trim(),
    // 0061: an OFS request answers the special inspection question; no other kind carries the field.
    ...(v.kind === 'ofs' ? { special_required: v.specialRequired } : {}),
  };
  return callFunction('request-link', await formOf(payload, v.files), submittedSchema);
}

/** Sends the request: the receipt (the number the database gave, the tracker's facts, the status link's token). */
export function useSubmitPublicRequest(key: LinkKey) {
  return useMutation({ mutationFn: (v: PublicRequestInput) => send(key, v) });
}

async function sendOfs(key: LinkKey, v: PublicOfsInput): Promise<Submitted> {
  if (isMock()) return mockRevs.submitOfs(key, v);
  const payload = {
    ...visitorPayload(key, v), area_ids: v.areaIds, item_ids: v.itemIds, sheet_file_id: v.sheetFileId, special_required: v.specialRequired,
  };
  return callFunction('request-link', await formOf(payload, v.files), submittedSchema);
}

/** Sends the revs request (an OFS request on 1 to 3 items of picked walls): the same receipt as any link request; its
 *  map opens by that receipt (requestNoLoginRevs.ts). */
export function useSubmitPublicOfs(key: LinkKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: PublicOfsInput) => sendOfs(key, v),
    // The walls' status moved (requested).
    onSettled: () => qc.invalidateQueries({ queryKey: qk.requestLinkRevs(key.projectId, key.hubId ?? 'job') }),
  });
}

/** A request's status refreshes this often while on screen (MDR's contractor view); a hidden tab pauses it (TanStack
 *  Query's default: no refetch in the background). */
const STATUS_LIVE_MS = 30_000;

/** A request sent through the link, by its private receipt (the status link). A wrong one rejects with 404. */
export function useRequestStatus(projectId: string, receipt: string) {
  return useQuery({
    queryKey: qk.requestStatus(projectId, receipt),
    queryFn: (): Promise<RequestFacts> =>
      isMock()
        ? mock.status(projectId, receipt)
        : callFunction('request-link', { action: 'status', project_id: projectId, receipt }, requestFactsSchema),
    retry: false,
    refetchInterval: STATUS_LIVE_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * The request's IR PDF by its receipt (0075): a fresh short-lived URL and the filename, per call (the server logs each
 * as a download). The file viewer shows the URL; Download saves it with lib/saveFile.
 */
export function publicIrFile(projectId: string, receipt: string): Promise<PublicIr> {
  return isMock() ? mock.ir(projectId, receipt) : callFunction('request-link', { action: 'ir', project_id: projectId, receipt }, publicIrSchema);
}
