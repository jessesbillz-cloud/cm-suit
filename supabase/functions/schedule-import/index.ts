// Read an uploaded schedule into a draft version (migration 0062; research scratch/research/schedule-integration.md).
// One button takes any file: P6 XER, MS Project XML, CSV, a PDF or a photo; the kind is decided from the bytes
// (_shared/schedule/detect.ts). XER, XML and CSV are parsed here (_shared/schedule/*.ts); a PDF or a photo is read by
// the typed AI task readSchedule (prompts/readSchedule.md). Every import lands as a DRAFT the person reviews and
// publishes; nothing is published here.
//
// Order: requireUser → requireCapability(project, 'schedule.manage') → the file AS THE CALLER (RLS on files) → a file
// already imported answers its draft (schedule_import_draft, repeat-safe) → read the bytes → parse → clean
// (rows.ts finishRows) → schedule_import_draft AS THE CALLER, which checks again that the file is in the job's Schedule
// folder and the caller may manage the schedule. Listed in admin_service_key_allowlist.txt: the service client only
// downloads the file's bytes from private storage and writes the ai_calls log, after every check above.
//
// Body: { project_id, file_id }. Answer: { version_id, source_kind, rows, warnings }.
import { PDFDocument } from 'pdf-lib';
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { bytesToBase64, sha256HexBytes } from '../_shared/crypto.ts';
import { runTask } from '../_shared/ai.ts';
import { csvSchedule } from '../_shared/schedule/csv.ts';
import { detectKind } from '../_shared/schedule/detect.ts';
import { mspdiSchedule } from '../_shared/schedule/mspdi.ts';
import { readScheduleTask, scheduleFromRead } from '../_shared/schedule/readSchedule.ts';
import { finishRows, type ParsedSchedule } from '../_shared/schedule/rows.ts';
import { decodeText, xerSchedule } from '../_shared/schedule/xer.ts';

const Body = z.object({ project_id: uuid, file_id: uuid }).strict();

/** Schedules of 5,000 activities are well under this as text. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** What the model takes in one request: a PDF (base64 grows it by a third) and a photo. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A look-ahead is a few pages; past this the read would not finish in time. */
const MAX_PDF_PAGES = 20;

interface ScheduleFile { id: string; original_name: string; mime: string; size: number; storage_path: string; upload_complete: boolean; scan_status: string }

/** The job's today in its time zone, YYYY-MM-DD. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function parseText(kind: 'xer' | 'msp_xml' | 'csv', bytes: Uint8Array): ParsedSchedule {
  const text = decodeText(bytes);
  if (kind === 'xer') return xerSchedule(text);
  return kind === 'msp_xml' ? mspdiSchedule(text) : csvSchedule(text);
}

async function pdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch (e) {
    console.warn('schedule-import: could not count the PDF pages', e);
    return null;
  }
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 1024);
  await requireCapability(client, body.project_id, 'schedule.manage');

  const file = must(
    await client.from('files').select('id, original_name, mime, size, storage_path, upload_complete, scan_status')
      .eq('id', body.file_id).eq('project_id', body.project_id).maybeSingle(),
    'file lookup',
  ) as ScheduleFile | null;
  if (!file) throw new HttpError(404, 'File not found');
  if (file.scan_status === 'infected') return refuse(req, 409, 'unreadable', 'This file failed the virus scan.');
  if (!file.upload_complete) return refuse(req, 409, 'not_ready', 'The upload has not finished. Try again in a minute.');
  if (file.size > MAX_FILE_BYTES) return refuse(req, 400, 'too_large', 'Over 25 MB: too big to read.');

  const args = { p_project_id: body.project_id, p_file_id: file.id };
  const earlier = must(
    await client.from('schedule_versions').select('id, source_kind').eq('file_id', file.id).maybeSingle(),
    'version lookup',
  ) as { id: string; source_kind: string } | null;
  if (earlier) {
    // Read once: the same draft (a discarded one comes back).
    const id = await rpc<string>(client, 'schedule_import_draft', {
      ...args, p_source_kind: earlier.source_kind, p_title: null, p_data_date: null, p_content_hash: null, p_model: null,
      p_warnings: [], p_rows: [],
    });
    return ok(req, { version_id: id, source_kind: earlier.source_kind, rows: null, warnings: [] });
  }

  // Every check above ran as the caller. The service client reads the bytes (private storage) and logs the AI call.
  const service = serviceClient();
  const { data, error } = await service.storage.from('files').download(file.storage_path);
  if (error || !data) throw new HttpError(500, `storage download: ${error?.message ?? 'no data'}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const detected = detectKind(file.original_name, file.mime, bytes.subarray(0, 4096));
  if ('refuse' in detected) return refuse(req, 400, detected.refuse, detected.message);

  const project = must(
    await client.from('projects').select('id, name, timezone').eq('id', body.project_id).single(),
    'project lookup',
  ) as { id: string; name: string; timezone: string };
  let parsed: ParsedSchedule;
  let model: string | null = null;
  if (detected.kind === 'xer' || detected.kind === 'msp_xml' || detected.kind === 'csv') {
    try {
      parsed = parseText(detected.kind, bytes);
    } catch (e) {
      console.warn(`schedule-import: could not parse file ${file.id}`, e);
      return refuse(req, 400, 'unreadable', 'This file could not be read. Check that it is complete, then upload it again.');
    }
  } else {
    const pdf = detected.kind === 'pdf';
    if (bytes.length > (pdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      return refuse(req, 400, 'too_large', pdf ? 'Over 15 MB: upload the look-ahead pages only.' : 'The photo is too big. Take it again.');
    }
    if (pdf && ((await pdfPages(bytes)) ?? 0) > MAX_PDF_PAGES) {
      return refuse(req, 400, 'too_long', `Over ${String(MAX_PDF_PAGES)} pages: upload the XER, or the look-ahead pages only.`);
    }
    const read = await runTask(readScheduleTask, {
      fileId: file.id, mediaType: detected.mediaType, base64: bytesToBase64(bytes), project, today: todayIn(project.timezone),
    }, { service, projectId: project.id, userId: user.id });
    if (!read.output.legible) {
      return refuse(req, 400, 'illegible', pdf ? 'No dates could be read in this PDF.' : 'No dates could be read. Take the photo closer.');
    }
    parsed = scheduleFromRead(read.output);
    model = read.model;
  }

  const { rows, warnings } = finishRows(parsed.rows, parsed.warnings);
  if (rows.length === 0) return refuse(req, 400, 'empty', parsed.warnings[0] ?? 'No activities found in this file.');
  // A super's photo, a PDF or a sheet seldom says its data date: the upload day (the job's day) stands in, and the
  // person corrects it in the review. A scheduler's XER or XML always carries its own.
  const dataDate = parsed.dataDate ?? (detected.kind === 'xer' || detected.kind === 'msp_xml' ? null : todayIn(project.timezone));
  const versionId = await rpc<string>(client, 'schedule_import_draft', {
    ...args, p_source_kind: detected.kind, p_title: parsed.title, p_data_date: dataDate,
    p_content_hash: await sha256HexBytes(bytes), p_model: model, p_warnings: warnings, p_rows: rows,
  });
  return ok(req, { version_id: versionId, source_kind: detected.kind, rows: rows.length, warnings });
}));
